
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_user_id": string | null,"at": string,"changed_fields": (string)[] | null,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_user_id"?: string | null,"at"?: string,"changed_fields"?: (string)[] | null,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_user_id"?: string | null,"at"?: string,"changed_fields"?: (string)[] | null,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "display_order": number | null,"group_key": string | null,"id": string,"is_required": boolean,"name": string,"rsvp_deadline": string | null,"slug": string,"starts_at": string | null,"venue_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "display_order"?: number | null,"group_key"?: string | null,"id"?: string,"is_required": boolean,"name": string,"rsvp_deadline"?: string | null,"slug": string,"starts_at"?: string | null,"venue_name"?: string | null
                  }
                  Update: {
                    "display_order"?: number | null,"group_key"?: string | null,"id"?: string,"is_required"?: boolean,"name"?: string,"rsvp_deadline"?: string | null,"slug"?: string,"starts_at"?: string | null,"venue_name"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"guests": {
                  Row: {
                    "created_at": string,"dietary_notes": string | null,"email": string | null,"first_name": string | null,"household_id": string,"id": string,"is_placeholder": boolean,"is_plus_one": boolean,"last_name": string | null,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dietary_notes"?: string | null,"email"?: string | null,"first_name"?: string | null,"household_id": string,"id"?: string,"is_placeholder"?: boolean,"is_plus_one"?: boolean,"last_name"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"dietary_notes"?: string | null,"email"?: string | null,"first_name"?: string | null,"household_id"?: string,"id"?: string,"is_placeholder"?: boolean,"is_plus_one"?: boolean,"last_name"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guests_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "address": Json | null,"auth_user_id": string | null,"contact_email": string | null,"created_at": string,"delivery_problem": boolean,"display_name": string,"id": string,"message_to_couple": string | null,"notes": string | null,"plus_one_allowance": number,"reminders_opt_out": boolean,"rsvp_deadline_override": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: Json | null,"auth_user_id"?: string | null,"contact_email"?: string | null,"created_at"?: string,"delivery_problem"?: boolean,"display_name": string,"id"?: string,"message_to_couple"?: string | null,"notes"?: string | null,"plus_one_allowance"?: number,"reminders_opt_out"?: boolean,"rsvp_deadline_override"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: Json | null,"auth_user_id"?: string | null,"contact_email"?: string | null,"created_at"?: string,"delivery_problem"?: boolean,"display_name"?: string,"id"?: string,"message_to_couple"?: string | null,"notes"?: string | null,"plus_one_allowance"?: number,"reminders_opt_out"?: boolean,"rsvp_deadline_override"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "event_id": string,"guest_id": string,"invited_at": string,"invited_by": string | null,"responded_at": string | null,"responded_by": string | null,"status": Database["public"]['Enums']["rsvp_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"guest_id": string,"invited_at"?: string,"invited_by"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"status"?: Database["public"]['Enums']["rsvp_status"]
                  }
                  Update: {
                    "event_id"?: string,"guest_id"?: string,"invited_at"?: string,"invited_by"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"status"?: Database["public"]['Enums']["rsvp_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvp_history": {
                  Row: {
                    "actor_kind": string,"changed_at": string,"changed_by": string | null,"event_id": string | null,"guest_id": string | null,"id": number,"new_status": Database["public"]['Enums']["rsvp_status"],"old_status": Database["public"]['Enums']["rsvp_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_kind": string,"changed_at"?: string,"changed_by"?: string | null,"event_id"?: string | null,"guest_id"?: string | null,"id"?: never,"new_status": Database["public"]['Enums']["rsvp_status"],"old_status"?: Database["public"]['Enums']["rsvp_status"] | null
                  }
                  Update: {
                    "actor_kind"?: string,"changed_at"?: string,"changed_by"?: string | null,"event_id"?: string | null,"guest_id"?: string | null,"id"?: never,"new_status"?: Database["public"]['Enums']["rsvp_status"],"old_status"?: Database["public"]['Enums']["rsvp_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvp_history_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvp_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "couple_names": string | null,"default_rsvp_deadline": string | null,"id": boolean,"last_dispatch_at": string | null,"rsvp_open": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "couple_names"?: string | null,"default_rsvp_deadline"?: string | null,"id"?: boolean,"last_dispatch_at"?: string | null,"rsvp_open"?: boolean
                  }
                  Update: {
                    "couple_names"?: string | null,"default_rsvp_deadline"?: string | null,"id"?: boolean,"last_dispatch_at"?: string | null,"rsvp_open"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "created_at": string,"display_name": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "current_actor_kind":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"effective_rsvp_deadline":
{ Args: { "p_event_id": string,"p_household_id": string }; Returns: string
                           },
"is_couple":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "campaign_status": "draft"|"scheduled"|"sending"|"done"|"cancelled","dietary_kind": "diet"|"allergen","menu_status": "draft"|"published"|"closed","message_status": "queued"|"sending"|"sent"|"delivered"|"bounced"|"complained"|"failed"|"skipped","rsvp_status": "pending"|"attending"|"declined","staff_role": "couple"|"planner"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "campaign_status": ["draft", "scheduled", "sending", "done", "cancelled"],"dietary_kind": ["diet", "allergen"],"menu_status": ["draft", "published", "closed"],"message_status": ["queued", "sending", "sent", "delivered", "bounced", "complained", "failed", "skipped"],"rsvp_status": ["pending", "attending", "declined"],"staff_role": ["couple", "planner"]
          }
        }
} as const
