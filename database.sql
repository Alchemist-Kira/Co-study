-- Create a table for public profiles
create table profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  updated_at timestamp with time zone,
  
  constraint username_length check (char_length(username) >= 3)
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- Create a table for friendships
create table friendships (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) not null,
  friend_id uuid references profiles(id) not null,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  unique(user_id, friend_id)
);

alter table friendships enable row level security;

create policy "Users can view their own friendships." on friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can insert their own friendships." on friendships
  for insert with check (auth.uid() = user_id);

create policy "Users can update their friendships." on friendships
  for update using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Users can delete their friendships." on friendships
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);


-- Create a table for rooms
create table rooms (
  id uuid default uuid_generate_v4() primary key,
  host_id uuid references profiles(id) not null,
  name text not null,
  video_url text,
  video_progress numeric default 0,
  is_playing boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table rooms enable row level security;

create policy "Rooms are viewable by everyone." on rooms
  for select using (true);

create policy "Authenticated users can create rooms." on rooms
  for insert with check (auth.uid() = host_id);

create policy "Host can update room." on rooms
  for update using (auth.uid() = host_id);


-- Function to handle new user signup and create a profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to automatically create a profile for a new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Realtime for rooms table
alter publication supabase_realtime add table rooms;
