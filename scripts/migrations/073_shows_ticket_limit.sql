-- Optional cap on how many tickets can be sold online for a show. NULL = no cap
-- (the default, matching prior behavior). When set, the /tickets page and the
-- on-demand /checkout route compare it against tickets already sold
-- (sum of quantity from completed ticket_purchases) and stop selling once the
-- cap is reached. Door/cash sales aren't in ticket_purchases, so this caps
-- ONLINE sales only.
alter table shows add column if not exists ticket_limit int;
