update public.games
set platforms = array_remove(platforms, 'Non défini')
where 'Non défini' = any(platforms);
