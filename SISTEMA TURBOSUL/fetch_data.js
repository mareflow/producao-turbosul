const SUPABASE_URL = 'https://zghaqlaqozsskfldgsfe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnaGFxbGFxb3pzc2tmbGRnc2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMDY1MzQsImV4cCI6MjA4NDc4MjUzNH0.aC2DMOUNhS2uK6KGI5Sf2c2vGhrCKHMnRyZhL3WwSus';

fetch(`${SUPABASE_URL}/rest/v1/component_tracking?select=*&limit=3`, {
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
})
.then(res => res.json())
.then(d => console.log('Tracking:', JSON.stringify(d, null, 2)));

fetch(`${SUPABASE_URL}/rest/v1/history_events?select=*&limit=3`, {
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
})
.then(res => res.json())
.then(d => console.log('History:', JSON.stringify(d, null, 2)));
