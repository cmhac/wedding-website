import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionForm } from "../forms/ActionForm";
import type { ActionResult } from "@/lib/admin/actions/shared";

type Action = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function renderForm(action: Action, extra = {}) {
  return render(
    <ActionForm action={action} submitLabel="Save" {...extra}>
      {({ fieldErrors, values }) => (
        <>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            defaultValue={String(values.name ?? "")}
          />
          {fieldErrors.name ? <p>{fieldErrors.name}</p> : null}
        </>
      )}
    </ActionForm>,
  );
}

describe("ActionForm", () => {
  it("shows the returned message in an alert and the field error beside the field", async () => {
    const action: Action = async () => ({
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { name: "This is required." },
      values: { name: "" },
    });
    renderForm(action);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please fix the highlighted fields.",
    );
    expect(screen.getByText("This is required.")).toBeInTheDocument();
  });

  it("keeps the values the person typed after a failure", async () => {
    const action: Action = async (_prev, formData) => ({
      ok: false,
      message: "Nope.",
      fieldErrors: { name: "Too short." },
      values: { name: String(formData.get("name")) },
    });
    renderForm(action);
    await userEvent.type(screen.getByLabelText("Name"), "Al");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Too short.");
    expect(screen.getByLabelText("Name")).toHaveValue("Al");
  });

  it("disables the submit button while pending", async () => {
    let finish: (r: ActionResult) => void = () => {};
    const action: Action = () =>
      new Promise<ActionResult>((resolve) => {
        finish = resolve;
      });
    renderForm(action);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    finish({ ok: true });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("shows a success message when the action returns ok", async () => {
    const action: Action = async () => ({ ok: true });
    renderForm(action, { successMessage: "Saved." });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Saved.");
  });

  it("shows no alert before anything is submitted", () => {
    renderForm(async () => ({ ok: true }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
