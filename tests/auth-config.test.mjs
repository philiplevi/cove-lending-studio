import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSupabaseConfig,configExplanation,readableAuthError} from '../lib/runtime-config.ts';

test('reject missing and malformed Supabase settings',()=>{
 assert.equal(validateSupabaseConfig(undefined,'x'),'missing_url');
 assert.equal(validateSupabaseConfig('https://example.com','x'),'invalid_url');
 assert.equal(validateSupabaseConfig('https://abc.supabase.co/path','x'),'invalid_url');
 assert.equal(validateSupabaseConfig('https://abc.supabase.co',undefined),'missing_key');
 assert.equal(validateSupabaseConfig('https://abc.supabase.co','sb_secret_not_allowed'),'forbidden_key');
 assert.equal(validateSupabaseConfig('https://abc.supabase.co','YOUR_SUPABASE_PUBLISHABLE_KEY'),'missing_key');
});

test('accept valid publishable/anon configuration shape',()=>{
 assert.equal(validateSupabaseConfig('https://project-abc.supabase.co/','sb_publishable_example'),null);
 assert.equal(validateSupabaseConfig('https://project-abc.supabase.co','eyJhbGciOiJIUzI1NiJ9.demo'),null);
});

test('auth errors distinguish network, signup trigger, and config failures',()=>{
 assert.equal(readableAuthError(new Error('fetch failed')).status,503);
 assert.match(readableAuthError({message:'Database error saving new user',status:500}).message,/workspace trigger/i);
 assert.equal(readableAuthError({message:'Signups not allowed',status:422}).status,403);
 assert.match(configExplanation('missing_key'),/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
