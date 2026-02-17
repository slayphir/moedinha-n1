import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Contact = {
    id: string;
    org_id: string;
    name: string;
    phone?: string;
    email?: string;
    relationship?: string;
};

export function useFinancialData() {
    const supabase = createClient();

    const accountsQuery = useQuery({
        queryKey: ["accounts"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("accounts")
                .select("*")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const categoriesQuery = useQuery({
        queryKey: ["categories"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("categories")
                .select("*")
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const tagsQuery = useQuery({
        queryKey: ["tags"],
        queryFn: async () => {
            const { data, error } = await supabase.from("tags").select("*").order("name");
            if (error) throw error;
            return data;
        },
    });

    const contactsQuery = useQuery({
        queryKey: ["contacts"],
        queryFn: async () => {
            const { data, error } = await supabase.from("contacts").select("*").order("name");
            if (error) throw error;
            return data as Contact[];
        },
    });

    return {
        accounts: accountsQuery.data || [],
        categories: categoriesQuery.data || [],
        tags: tagsQuery.data || [],
        contacts: contactsQuery.data || [],
        isLoading: accountsQuery.isLoading || categoriesQuery.isLoading || contactsQuery.isLoading,
        refetch: () => {
            accountsQuery.refetch();
            categoriesQuery.refetch();
            tagsQuery.refetch();
            contactsQuery.refetch();
        }
    };
}
