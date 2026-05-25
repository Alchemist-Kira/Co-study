const { createClient } = require('@supabase/supabase-js');

const url = 'https://blcxhowdnrugxtggybhl.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsY3hob3dkbnJ1Z3h0Z2d5YmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTU2MDgsImV4cCI6MjA5NTI5MTYwOH0.rV4P_Mlh_WfDU23KBcsaTRCTfTKnphYlJs-A2vyeyLk';

const supabase = createClient(url, key);

async function test() {
  try {
    console.log('Testing correct Supabase connection...');
    const { data, error } = await supabase.auth.signUp({
      email: 'test' + Math.random() + '@example.com',
      password: 'password123',
    });
    console.log('Result Data:', !!data?.user);
    console.log('Result Error:', error);
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

test();
