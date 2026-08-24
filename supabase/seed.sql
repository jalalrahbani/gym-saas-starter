-- Optional demo seed. Run only in a local/dev Supabase project.
insert into public.organizations (id, name, slug, country_code, timezone, base_currency)
values ('11111111-1111-1111-1111-111111111111', 'Titan Fitness', 'titan-fitness', 'LB', 'Asia/Beirut', 'USD')
on conflict do nothing;

insert into public.locations (id, organization_id, name, address)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Beirut', 'Beirut, Lebanon')
on conflict do nothing;

insert into public.membership_plans (organization_id, location_id, name, billing_type, duration_days, price_minor, currency)
values
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Monthly','one_time',30,5500,'USD'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Quarterly','one_time',90,13500,'USD'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Annual','one_time',365,42000,'USD');
