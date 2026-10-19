
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
                },"campaigns": {
                  Row: {
                    "audience": NonNullable<Json>,"completed_at": string | null,"created_at": string,"created_by": string | null,"id": string,"last_error_code": string | null,"message_type_key": string,"name": string,"scheduled_for": string | null,"started_at": string | null,"status": Database["public"]['Enums']["campaign_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_error_code"?: string | null,"message_type_key": string,"name": string,"scheduled_for"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"updated_at"?: string
                  }
                  Update: {
                    "audience"?: NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_error_code"?: string | null,"message_type_key"?: string,"name"?: string,"scheduled_for"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_message_type_key_fkey"
      columns: ["message_type_key"]
isOneToOne: false
      referencedRelation: "message_types"
      referencedColumns: ["key"]
    }
                  ]
                },"courses": {
                  Row: {
                    "display_order": number | null,"id": string,"menu_id": string,"name": string,"requires_choice": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "display_order"?: number | null,"id"?: string,"menu_id": string,"name": string,"requires_choice"?: boolean
                  }
                  Update: {
                    "display_order"?: number | null,"id"?: string,"menu_id"?: string,"name"?: string,"requires_choice"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_menu_id_fkey"
      columns: ["menu_id"]
isOneToOne: false
      referencedRelation: "menus"
      referencedColumns: ["id"]
    }
                  ]
                },"dietary_categories": {
                  Row: {
                    "display_order": number | null,"key": string,"kind": Database["public"]['Enums']["dietary_kind"],"label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "display_order"?: number | null,"key": string,"kind": Database["public"]['Enums']["dietary_kind"],"label": string
                  }
                  Update: {
                    "display_order"?: number | null,"key"?: string,"kind"?: Database["public"]['Enums']["dietary_kind"],"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dish_tags": {
                  Row: {
                    "category_key": string,"dish_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_key": string,"dish_id": string
                  }
                  Update: {
                    "category_key"?: string,"dish_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dish_tags_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "dietary_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "dish_tags_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["category_key"]
    },{
      foreignKeyName: "dish_tags_dish_id_fkey"
      columns: ["dish_id"]
isOneToOne: false
      referencedRelation: "dishes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dish_tags_dish_id_fkey"
      columns: ["dish_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["dish_id"]
    }
                  ]
                },"dishes": {
                  Row: {
                    "archived_at": string | null,"course_id": string,"description": string | null,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"course_id": string,"description"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "archived_at"?: string | null,"course_id"?: string,"description"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dishes_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dishes_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["course_id"]
    }
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
                },"guest_dietary": {
                  Row: {
                    "category_key": string,"details": string | null,"guest_id": string,"severity": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_key": string,"details"?: string | null,"guest_id": string,"severity": string
                  }
                  Update: {
                    "category_key"?: string,"details"?: string | null,"guest_id"?: string,"severity"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_dietary_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "dietary_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "guest_dietary_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["category_key"]
    },{
      foreignKeyName: "guest_dietary_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "dietary_list"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "guest_dietary_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_dietary_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["guest_id"]
    }
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
      referencedRelation: "household_rsvp_progress"
      referencedColumns: ["household_id"]
    },{
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
      referencedRelation: "event_counts"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "invitations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "dietary_list"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "invitations_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["guest_id"]
    }
                  ]
                },"meal_selection_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"course_id": string | null,"guest_id": string | null,"id": number,"new_dish_id": string | null,"old_dish_id": string | null,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"course_id"?: string | null,"guest_id"?: string | null,"id"?: never,"new_dish_id"?: string | null,"old_dish_id"?: string | null,"reason": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"course_id"?: string | null,"guest_id"?: string | null,"id"?: never,"new_dish_id"?: string | null,"old_dish_id"?: string | null,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_selection_history_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selection_history_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["course_id"]
    },{
      foreignKeyName: "meal_selection_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "dietary_list"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "meal_selection_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selection_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "meal_selection_history_new_dish_id_fkey"
      columns: ["new_dish_id"]
isOneToOne: false
      referencedRelation: "dishes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selection_history_new_dish_id_fkey"
      columns: ["new_dish_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["dish_id"]
    },{
      foreignKeyName: "meal_selection_history_old_dish_id_fkey"
      columns: ["old_dish_id"]
isOneToOne: false
      referencedRelation: "dishes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selection_history_old_dish_id_fkey"
      columns: ["old_dish_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["dish_id"]
    }
                  ]
                },"meal_selections": {
                  Row: {
                    "chosen_at": string,"chosen_by": string | null,"course_id": string,"dish_id": string,"guest_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chosen_at"?: string,"chosen_by"?: string | null,"course_id": string,"dish_id": string,"guest_id": string
                  }
                  Update: {
                    "chosen_at"?: string,"chosen_by"?: string | null,"course_id"?: string,"dish_id"?: string,"guest_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_selections_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selections_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["course_id"]
    },{
      foreignKeyName: "meal_selections_dish_id_course_id_fkey"
      columns: ["dish_id","course_id"]
isOneToOne: false
      referencedRelation: "dishes"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "meal_selections_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "dietary_list"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "meal_selections_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_selections_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["guest_id"]
    }
                  ]
                },"menus": {
                  Row: {
                    "event_id": string,"id": string,"notes": string | null,"status": Database["public"]['Enums']["menu_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"id"?: string,"notes"?: string | null,"status"?: Database["public"]['Enums']["menu_status"]
                  }
                  Update: {
                    "event_id"?: string,"id"?: string,"notes"?: string | null,"status"?: Database["public"]['Enums']["menu_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "menus_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "event_counts"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "menus_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"message_events": {
                  Row: {
                    "id": number,"message_id": string,"occurred_at": string,"provider_event_id": string,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"message_id": string,"occurred_at": string,"provider_event_id": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: never,"message_id"?: string,"occurred_at"?: string,"provider_event_id"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_events_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"message_types": {
                  Row: {
                    "is_essential": boolean,"key": string,"label": string,"template_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_essential"?: boolean,"key": string,"label": string,"template_key": string
                  }
                  Update: {
                    "is_essential"?: boolean,"key"?: string,"label"?: string,"template_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "campaign_id": string,"error_code": string | null,"household_id": string | null,"id": string,"last_event_at": string | null,"provider_message_id": string | null,"queued_at": string,"sent_at": string | null,"skip_reason": string | null,"status": Database["public"]['Enums']["message_status"],"to_email": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"error_code"?: string | null,"household_id"?: string | null,"id"?: string,"last_event_at"?: string | null,"provider_message_id"?: string | null,"queued_at"?: string,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"to_email"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"error_code"?: string | null,"household_id"?: string | null,"id"?: string,"last_event_at"?: string | null,"provider_message_id"?: string | null,"queued_at"?: string,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"to_email"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household_rsvp_progress"
      referencedColumns: ["household_id"]
    },{
      foreignKeyName: "messages_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
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
      referencedRelation: "event_counts"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "rsvp_history_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvp_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "dietary_list"
      referencedColumns: ["guest_id"]
    },{
      foreignKeyName: "rsvp_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvp_history_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["guest_id"]
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
            "dietary_list": {
                  Row: {
                    "category_key": string | null,"category_label": string | null,"details": string | null,"dietary_notes": string | null,"event_id": string | null,"event_slug": string | null,"first_name": string | null,"guest_id": string | null,"household_id": string | null,"household_name": string | null,"last_name": string | null,"severity": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "guest_dietary_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "dietary_categories"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "guest_dietary_category_key_fkey"
      columns: ["category_key"]
isOneToOne: false
      referencedRelation: "meal_conflicts"
      referencedColumns: ["category_key"]
    },{
      foreignKeyName: "guests_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household_rsvp_progress"
      referencedColumns: ["household_id"]
    },{
      foreignKeyName: "guests_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "event_counts"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "invitations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"dish_totals": {
                  Row: {
                    "chosen_count": number | null,"course_display_order": number | null,"course_id": string | null,"course_name": string | null,"dish_id": string | null,"dish_name": string | null,"event_id": string | null,"event_slug": string | null,"not_yet_chosen": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"event_counts": {
                  Row: {
                    "attending": number | null,"declined": number | null,"event_id": string | null,"invited": number | null,"name": string | null,"pending": number | null,"slug": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"household_rsvp_progress": {
                  Row: {
                    "display_name": string | null,"household_id": string | null,"pending_meals": number | null,"pending_optional": number | null,"pending_required": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"meal_conflicts": {
                  Row: {
                    "category_key": string | null,"course_id": string | null,"course_name": string | null,"dish_id": string | null,"dish_name": string | null,"event_id": string | null,"event_slug": string | null,"first_name": string | null,"guest_id": string | null,"household_id": string | null,"kind": Database["public"]['Enums']["dietary_kind"] | null,"last_name": string | null,"severity": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "guests_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "household_rsvp_progress"
      referencedColumns: ["household_id"]
    },{
      foreignKeyName: "guests_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menus_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "event_counts"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "menus_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "archive_dish":
{ Args: { "dish_id": string }; Returns: {
              "guest_id": string,"household_id": string
            }[]
                           },
"claim_campaign_messages":
{ Args: { "campaign_id": string,"limit": number }; Returns: {
              "household_id": string,"id": string,"to_email": string
            }[]
                           },
"create_household_record":
{ Args: { "payload": Json }; Returns: Json
                           },
"current_actor_kind":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_household_record":
{ Args: { "household_id": string }; Returns: Json
                           },
"due_scheduled_campaigns":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string
            }[]
                           },
"effective_rsvp_deadline":
{ Args: { "p_event_id": string,"p_household_id": string }; Returns: string
                           },
"find_duplicate_households":
{ Args: Record<PropertyKey, never>; Returns: {
              "household_a": string,"household_b": string,"reasons": (string)[]
            }[]
                           },
"get_my_rsvp":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"import_households":
{ Args: { "rows": Json }; Returns: Json
                           },
"invite":
{ Args: { "event_id": string,"guest_ids": (string)[] }; Returns: Json
                           },
"is_couple":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_audience":
{ Args: { "audience": Json }; Returns: boolean
                           },
"name_plus_one":
{ Args: { "first_name": string,"guest_id": string,"last_name": string }; Returns: Json
                           },
"record_message_event":
{ Args: { "occurred_at": string,"provider_event_id": string,"provider_message_id": string,"type": string }; Returns: string
                           },
"resolve_audience":
{ Args: { "filter": Json,"message_type_key"?: string }; Returns: {
              "deliverable": boolean,"display_name": string,"household_id": string,"skip_reason": string
            }[]
                           },
"set_household_contact":
{ Args: { "auth_user_id": string,"contact_email": string,"household_id": string }; Returns: Json
                           },
"set_reminders_opt_out":
{ Args: { "opt_out": boolean }; Returns: boolean
                           },
"staff_set_meal":
{ Args: { "course_id": string,"dish_id": string,"guest_id": string }; Returns: Json
                           },
"staff_set_rsvp":
{ Args: { "event_id": string,"guest_id": string,"status": Database["public"]['Enums']["rsvp_status"] }; Returns: Json
                           },
"submit_household_rsvp":
{ Args: { "payload": Json }; Returns: Json
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
