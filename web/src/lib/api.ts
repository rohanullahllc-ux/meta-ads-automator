import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Turns a failed Edge Function call into a readable message (the functions return { error: "..." }). */
export async function messageFrom(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) return String(body.error)
  }
  if (error instanceof FunctionsFetchError) {
    return 'Could not reach the server. Check your internet connection and try again.'
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error || data == null) throw new Error(await messageFrom(error))
  return data
}
