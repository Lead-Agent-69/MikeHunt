-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Add an embedding column to the listings table
-- We use 768 dimensions which is the default for Google's text-embedding-004 model
alter table public.listings add column if not exists embedding vector(768);

-- Create an index to speed up similarity searches using HNSW (Hierarchical Navigable Small World)
-- This is faster and scales better than exact nearest neighbor search
create index if not exists listings_embedding_idx on public.listings using hnsw (embedding vector_cosine_ops);

-- Add an embedding column to dealers for finding similar dealers
alter table public.dealers add column if not exists embedding vector(768);
create index if not exists dealers_embedding_idx on public.dealers using hnsw (embedding vector_cosine_ops);

-- Create a function to search for similar listings
create or replace function match_listings (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  title text,
  similarity float
)
language sql stable
as $$
  select
    id,
    title,
    1 - (listings.embedding <=> query_embedding) as similarity
  from public.listings
  where 1 - (listings.embedding <=> query_embedding) > match_threshold
  order by listings.embedding <=> query_embedding
  limit match_count;
$$;
