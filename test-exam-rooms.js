const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envLocal = fs.readFileSync('.env.local', 'utf8').replace(/\r/g, '');
const env = {};
envLocal.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  const value = rest.join('=');
  if (key && value) {
    env[key.trim()] = value.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);

async function test() {
  const { data, error } = await supabase
          .from('exam_rooms')
          .select('id,name,code,subject_code,subjects(name)')
          .eq('status', 'published')
          .order('subject_code');
  
  if (error) {
    console.error('Error fetching exam_rooms:', JSON.stringify(error, null, 2));
  } else {
    console.log('Success, data length:', data.length);
  }
}
test();
