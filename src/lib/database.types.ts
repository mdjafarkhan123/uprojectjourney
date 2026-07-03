export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '14.5';
	};
	public: {
		Tables: {
			admin_branding: {
				Row: {
					admin_id: string;
					company_name: string | null;
					logo_url: string | null;
					primary_color: string | null;
					updated_at: string;
				};
				Insert: {
					admin_id: string;
					company_name?: string | null;
					logo_url?: string | null;
					primary_color?: string | null;
					updated_at?: string;
				};
				Update: {
					admin_id?: string;
					company_name?: string | null;
					logo_url?: string | null;
					primary_color?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'admin_branding_admin_id_fkey';
						columns: ['admin_id'];
						isOneToOne: true;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			milestones: {
				Row: {
					created_at: string;
					expected_completion_date: string | null;
					id: string;
					name: string;
					overview: string | null;
					position: number;
					progress: number;
					project_id: string;
					scope_finalized: boolean;
					start_date: string | null;
					status: Database['public']['Enums']['milestone_status'];
					updated_at: string;
					weight: number;
				};
				Insert: {
					created_at?: string;
					expected_completion_date?: string | null;
					id?: string;
					name: string;
					overview?: string | null;
					position?: number;
					progress?: number;
					project_id: string;
					scope_finalized?: boolean;
					start_date?: string | null;
					status?: Database['public']['Enums']['milestone_status'];
					updated_at?: string;
					weight?: number;
				};
				Update: {
					created_at?: string;
					expected_completion_date?: string | null;
					id?: string;
					name?: string;
					overview?: string | null;
					position?: number;
					progress?: number;
					project_id?: string;
					scope_finalized?: boolean;
					start_date?: string | null;
					status?: Database['public']['Enums']['milestone_status'];
					updated_at?: string;
					weight?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'milestones_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			portal_views: {
				Row: {
					admin_id: string;
					client_id: string;
					id: string;
					last_seen_at: string;
					started_at: string;
				};
				Insert: {
					admin_id: string;
					client_id: string;
					id?: string;
					last_seen_at?: string;
					started_at?: string;
				};
				Update: {
					admin_id?: string;
					client_id?: string;
					id?: string;
					last_seen_at?: string;
					started_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'portal_views_admin_id_fkey';
						columns: ['admin_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'portal_views_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			projects: {
				Row: {
					admin_id: string;
					client_id: string;
					created_at: string;
					current_focus_goal: string | null;
					current_focus_title: string | null;
					expected_delivery_date: string | null;
					id: string;
					is_public: boolean;
					name: string;
					project_type: string | null;
					public_slug: string | null;
					status: Database['public']['Enums']['project_status'];
					template_key: string | null;
					updated_at: string;
				};
				Insert: {
					admin_id: string;
					client_id: string;
					created_at?: string;
					current_focus_goal?: string | null;
					current_focus_title?: string | null;
					expected_delivery_date?: string | null;
					id?: string;
					is_public?: boolean;
					name: string;
					project_type?: string | null;
					public_slug?: string | null;
					status?: Database['public']['Enums']['project_status'];
					template_key?: string | null;
					updated_at?: string;
				};
				Update: {
					admin_id?: string;
					client_id?: string;
					created_at?: string;
					current_focus_goal?: string | null;
					current_focus_title?: string | null;
					expected_delivery_date?: string | null;
					id?: string;
					is_public?: boolean;
					name?: string;
					project_type?: string | null;
					public_slug?: string | null;
					status?: Database['public']['Enums']['project_status'];
					template_key?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'projects_admin_id_fkey';
						columns: ['admin_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'projects_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			sessions: {
				Row: {
					created_at: string;
					expires_at: string;
					id: string;
					token_hash: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					expires_at: string;
					id?: string;
					token_hash: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					expires_at?: string;
					id?: string;
					token_hash?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'sessions_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			timeline_updates: {
				Row: {
					created_at: string;
					description: string | null;
					entry_date: string;
					id: string;
					milestone_id: string;
					required_action: string | null;
					status: Database['public']['Enums']['timeline_status'];
					title: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					entry_date: string;
					id?: string;
					milestone_id: string;
					required_action?: string | null;
					status?: Database['public']['Enums']['timeline_status'];
					title: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					entry_date?: string;
					id?: string;
					milestone_id?: string;
					required_action?: string | null;
					status?: Database['public']['Enums']['timeline_status'];
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'timeline_updates_milestone_id_fkey';
						columns: ['milestone_id'];
						isOneToOne: false;
						referencedRelation: 'milestones';
						referencedColumns: ['id'];
					}
				];
			};
			users: {
				Row: {
					avatar_url: string | null;
					created_at: string;
					full_name: string;
					id: string;
					owner_admin_id: string | null;
					password_hash: string;
					role: Database['public']['Enums']['user_role'];
					status: Database['public']['Enums']['user_status'];
					username: string;
				};
				Insert: {
					avatar_url?: string | null;
					created_at?: string;
					full_name: string;
					id?: string;
					owner_admin_id?: string | null;
					password_hash: string;
					role: Database['public']['Enums']['user_role'];
					status?: Database['public']['Enums']['user_status'];
					username: string;
				};
				Update: {
					avatar_url?: string | null;
					created_at?: string;
					full_name?: string;
					id?: string;
					owner_admin_id?: string | null;
					password_hash?: string;
					role?: Database['public']['Enums']['user_role'];
					status?: Database['public']['Enums']['user_status'];
					username?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'users_owner_admin_id_fkey';
						columns: ['owner_admin_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			get_public_journey: { Args: { p_slug: string }; Returns: Json };
			is_slug_available: {
				Args: { p_project_id: string; p_slug: string };
				Returns: boolean;
			};
		};
		Enums: {
			milestone_status: 'not_started' | 'open' | 'in_progress' | 'completed';
			project_status:
				'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';
			timeline_status:
				'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';
			user_role: 'admin' | 'client';
			user_status: 'active' | 'inactive';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends (DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never) = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never) = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			milestone_status: ['not_started', 'open', 'in_progress', 'completed'],
			project_status: [
				'planning',
				'in_progress',
				'waiting_for_client',
				'under_review',
				'completed'
			],
			timeline_status: [
				'not_started',
				'in_progress',
				'waiting_for_client',
				'under_review',
				'completed'
			],
			user_role: ['admin', 'client'],
			user_status: ['active', 'inactive']
		}
	}
} as const;
