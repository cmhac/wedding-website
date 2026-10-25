"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MESSAGE_TYPE_KEYS, type Audience } from "@/lib/campaigns/audience";
import { audienceFromForm } from "../audience-form";
import { formatPacific, pacificLocalToIso } from "../time";
import { runAdminAction, type ActionResult } from "./shared";

const CAMPAIGNS_PATH = "/admin/campaigns";
const EDITABLE = ["draft", "scheduled"];

type Options = { supabase?: SupabaseClient; now?: Date };

export type PreviewData = {
  willSend: { householdId: string; name: string }[];
  skipped: { householdId: string; name: string; reason: string }[];
};

const NAME_MESSAGE = "Enter a name for this campaign.";
const TYPE_MESSAGE = "Choose a message type.";

/** The fields every campaign action reads, with the audience built from them. */
function withAudience(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
): { audience: Audience } | typeof z.NEVER {
  const fd = new FormData();
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") fd.append(key, entry);
  }
  const result = audienceFromForm(fd);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      path: ["audience"],
      message: result.message,
    });
    return z.NEVER;
  }
  return { audience: result.audience };
}

const previewSchema = z
  .looseObject({
    message_type_key: z.enum(MESSAGE_TYPE_KEYS, TYPE_MESSAGE),
  })
  .transform((value, ctx) => {
    const box = withAudience(value, ctx);
    return box === z.NEVER
      ? z.NEVER
      : { messageType: value.message_type_key, audience: box.audience };
  });

function saveSchema(now: Date) {
  return z
    .looseObject({
      id: z.guid().optional(),
      name: z.string().trim().min(1, NAME_MESSAGE),
      message_type_key: z.enum(MESSAGE_TYPE_KEYS, TYPE_MESSAGE),
      intent: z.enum(["draft", "schedule"]).default("draft"),
      scheduled_for: z.string().trim().default(""),
    })
    .transform((value, ctx) => {
      const box = withAudience(value, ctx);
      const converted = pacificLocalToIso(value.scheduled_for);
      let scheduledFor: string | null = null;
      if (converted !== null && typeof converted === "object") {
        ctx.addIssue({
          code: "custom",
          path: ["scheduled_for"],
          message: converted.error,
        });
      } else if (value.intent === "schedule") {
        if (converted === null) {
          ctx.addIssue({
            code: "custom",
            path: ["scheduled_for"],
            message: "Choose when to send it.",
          });
        } else if (new Date(converted).getTime() <= now.getTime()) {
          ctx.addIssue({
            code: "custom",
            path: ["scheduled_for"],
            message: "Choose a time in the future.",
          });
        } else {
          scheduledFor = converted;
        }
      }
      if (box === z.NEVER) return z.NEVER;
      return {
        id: value.id,
        name: value.name,
        messageType: value.message_type_key,
        audience: box.audience,
        intent: value.intent,
        scheduledFor,
      };
    });
}

const cancelSchema = z.object({ id: z.guid() });

/** An audience problem is the whole message, not the generic one. */
function plainAudienceMessage<T>(result: ActionResult<T>): ActionResult<T> {
  if (!result.ok && result.fieldErrors?.audience) {
    return { ...result, message: result.fieldErrors.audience };
  }
  return result;
}

/** Who a campaign would reach and who is skipped. Saves nothing. */
export async function previewAudience(
  _previous: ActionResult<PreviewData> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<PreviewData>> {
  return plainAudienceMessage(
    await runAdminAction(
      previewSchema,
      formData,
      async ({ input, supabase }) => {
        const { data, error } = await supabase.rpc("resolve_audience", {
          filter: input.audience,
          message_type_key: input.messageType,
        });
        if (error) return { error };
        const rows = (data ?? []) as Array<{
          household_id: string;
          display_name: string;
          deliverable: boolean;
          skip_reason: string | null;
        }>;
        const preview: PreviewData = { willSend: [], skipped: [] };
        for (const row of rows) {
          if (row.deliverable) {
            preview.willSend.push({
              householdId: row.household_id,
              name: row.display_name,
            });
          } else {
            preview.skipped.push({
              householdId: row.household_id,
              name: row.display_name,
              reason: row.skip_reason ?? "other",
            });
          }
        }
        return { data: preview };
      },
      { supabase: options.supabase },
    ),
  );
}

/** Saves a draft or scheduled campaign; only while it is a draft or scheduled. */
export async function saveCampaign(
  _previous: ActionResult<{ id: string; message: string }> | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult<{ id: string; message: string }>> {
  return plainAudienceMessage(
    await runAdminAction(
      saveSchema(options.now ?? new Date()),
      formData,
      async ({ input, supabase }) => {
        const status = input.intent === "schedule" ? "scheduled" : "draft";
        const fields = {
          name: input.name,
          message_type_key: input.messageType,
          audience: input.audience,
          scheduled_for: input.scheduledFor,
        };

        if (!input.id) {
          const id = crypto.randomUUID();
          const { error } = await supabase
            .from("campaigns")
            .insert({ id, ...fields, status });
          if (error) return { error };
          revalidatePath(CAMPAIGNS_PATH);
          redirect(`${CAMPAIGNS_PATH}?tab=edit&id=${id}&saved=1`);
        }

        const id = input.id as string;
        const existing = await supabase
          .from("campaigns")
          .select("status")
          .eq("id", id)
          .maybeSingle();
        if (existing.error) return { error: existing.error };
        if (!existing.data) return { error: { message: "not_found" } };
        const current = existing.data.status as string;
        if (!EDITABLE.includes(current)) {
          return { error: { message: "campaign_locked" } };
        }
        // A scheduled campaign cannot go back to a draft; cancel it instead.
        if (current === "scheduled" && status === "draft") {
          return { error: { message: "invalid_status_transition" } };
        }
        const { error } = await supabase
          .from("campaigns")
          .update(current === status ? fields : { ...fields, status })
          .eq("id", id);
        return {
          error,
          revalidate: [CAMPAIGNS_PATH],
          data: {
            id,
            message:
              status === "scheduled" && input.scheduledFor
                ? `Scheduled for ${formatPacific(input.scheduledFor)}.`
                : "Saved as a draft.",
          },
        };
      },
      { supabase: options.supabase },
    ),
  );
}

/** Cancels a draft or scheduled campaign (the page asks first). */
export async function cancelCampaign(
  _previous: ActionResult | null,
  formData: FormData,
  options: Options = {},
): Promise<ActionResult> {
  return runAdminAction(
    cancelSchema,
    formData,
    async ({ input, supabase }) => {
      const existing = await supabase
        .from("campaigns")
        .select("status")
        .eq("id", input.id)
        .maybeSingle();
      if (existing.error) return { error: existing.error };
      if (!existing.data) return { error: { message: "not_found" } };
      if (!EDITABLE.includes(existing.data.status as string)) {
        return { error: { message: "invalid_status_transition" } };
      }
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "cancelled" })
        .eq("id", input.id);
      return { error, revalidate: [CAMPAIGNS_PATH] };
    },
    { supabase: options.supabase },
  );
}
