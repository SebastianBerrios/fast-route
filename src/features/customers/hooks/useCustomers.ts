"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  rowToCustomer,
  type Customer,
  type CustomerInput,
} from "@/features/customers/domain/types";
import { insertCustomer } from "@/features/customers/services/customers";

export interface UseCustomers {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  createCustomer: (input: CustomerInput) => Promise<boolean>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<boolean>;
  removeCustomer: (id: string) => Promise<boolean>;
}

// Realtime topics must be unique per subscription: the browser client is a
// singleton and `supabase.channel(name)` returns an existing channel for a
// reused topic. Calling `.on("postgres_changes", …)` on an already-subscribed
// channel throws — StrictMode's double-mounted effects hit this because the
// async `removeChannel` from the first run hasn't finished when the second
// run reuses the topic.
let channelSeq = 0;

/** Loads customers and keeps them in sync in real time across devices. */
export function useCustomers(userId: string): UseCustomers {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const fetchCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });

    if (error) setError(error.message);
    else {
      setCustomers((data ?? []).map(rowToCustomer));
      setError(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();

    const channel = supabase
      .channel(`customers-realtime-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => fetchCustomers(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCustomers]);

  const createCustomer = useCallback(
    async (input: CustomerInput) => {
      const { error: errorMessage } = await insertCustomer(
        supabase,
        userId,
        input,
      );
      if (errorMessage) {
        setError(errorMessage);
        return false;
      }
      await fetchCustomers();
      return true;
    },
    [supabase, userId, fetchCustomers],
  );

  const updateCustomer = useCallback(
    async (id: string, input: CustomerInput) => {
      const { error } = await supabase
        .from("customers")
        .update(input)
        .eq("id", id);
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchCustomers();
      return true;
    },
    [supabase, fetchCustomers],
  );

  const removeCustomer = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchCustomers();
      return true;
    },
    [supabase, fetchCustomers],
  );

  return {
    customers,
    loading,
    error,
    createCustomer,
    updateCustomer,
    removeCustomer,
  };
}
