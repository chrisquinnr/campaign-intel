-- Phase 1 RSS sources (locked in PLAN.md §9).
--
-- Topics tagged against the taxonomy from 0001_init.sql. Sources covering the
-- full world feed get all four priority topics so they're always considered;
-- specialist outlets are scoped to the topic they cover.
--
-- IMPORTANT: feed URLs change. Validate with `npm run rss:check` (or the
-- standalone scripts/check-rss.ts) before flipping `active=true` in prod.

insert into sources (kind, label, endpoint, lang, topics, active) values
  -- General world / wire services — all four priority topics
  ('rss', 'BBC World',           'http://feeds.bbci.co.uk/news/world/rss.xml',                                       'en', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'Al Jazeera English',  'https://www.aljazeera.com/xml/rss/all.xml',                                        'en', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'Al Jazeera Arabic',   'https://www.aljazeera.net/xml/rss/all.xml',                                        'ar', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'France24 English',    'https://www.france24.com/en/rss',                                                  'en', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'France24 French',     'https://www.france24.com/fr/rss',                                                  'fr', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'Deutsche Welle EN',   'https://rss.dw.com/rdf/rss-en-all',                                                'en', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'Le Monde Une',        'https://www.lemonde.fr/rss/une.xml',                                               'fr', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'El País Portada',     'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',                 'es', '{sudan,iran,us_politics,eu_politics}', true),
  ('rss', 'Reuters World',       'https://www.reutersagency.com/feed/?best-topics=world',                            'en', '{sudan,iran,us_politics,eu_politics}', false),  -- Reuters RSS unstable; verify
  ('rss', 'AP World',            'https://apnews.com/hub/ap-top-news/rss',                                           'en', '{sudan,iran,us_politics,eu_politics}', false),  -- AP deprecated public RSS; verify
  ('rss', 'FT World',            'https://www.ft.com/world?format=rss',                                              'en', '{sudan,iran,us_politics,eu_politics}', false),  -- paywall; verify access

  -- US politics specialists
  ('rss', 'NYT Politics',        'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',                        'en', '{us_politics}',                        true),
  ('rss', 'Politico US',         'https://rss.politico.com/politics-news.xml',                                       'en', '{us_politics}',                        true),
  ('rss', 'Axios',               'https://api.axios.com/feed/',                                                      'en', '{us_politics}',                        true),

  -- EU politics specialists
  ('rss', 'Politico EU',         'https://www.politico.eu/rss/',                                                     'en', '{eu_politics}',                        true),

  -- Sudan specialists
  ('rss', 'Sudan Tribune',       'https://sudantribune.com/feed/',                                                   'en', '{sudan}',                              true),
  ('rss', 'Radio Dabanga EN',    'https://www.dabangasudan.org/en/feed',                                             'en', '{sudan}',                              true),

  -- Iran specialists
  ('rss', 'IranWire',            'https://iranwire.com/en/feed/',                                                    'en', '{iran}',                               true),
  ('rss', 'Radio Farda',         'https://www.radiofarda.com/api/zoq$oeo_oqv$io',                                    'fa', '{iran}',                               false)  -- RFE/RL feed URLs are stable per service; validate
on conflict (kind, endpoint) do nothing;
