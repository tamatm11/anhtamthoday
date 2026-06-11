import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
