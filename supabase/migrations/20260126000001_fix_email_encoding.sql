-- Fix garbled UTF-8 characters in email_logs body_html and body_text
-- These characters were incorrectly encoded due to missing charset declaration
-- Using E'' escape strings for proper encoding

-- Fix body_html in email_logs
UPDATE email_logs
SET body_html = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        body_html,
                        E'\u00e2\u0080\u0094', E'\u2014'
                      ),
                      E'\u00e2\u0080\u0093', E'\u2013'
                    ),
                    E'\u00e2\u0080\u0099', E'\u2019'
                  ),
                  E'\u00e2\u0080\u0098', E'\u2018'
                ),
                E'\u00e2\u0080\u009c', E'\u201c'
              ),
              E'\u00e2\u0080\u009d', E'\u201d'
            ),
            E'\u00e2\u0080\u00a2', E'\u2022'
          ),
          E'\u00e2\u0080\u00a6', E'\u2026'
        ),
        E'\u00c2\u00a0', ' '
      ),
      E'\u00e2\u0098\u0086', E'\u2606'
    ),
    E'\u00e2\u0098\u0085', E'\u2605'
  ),
  E'\u00ef\u00bb\u00bf', ''
)
WHERE body_html LIKE E'%\u00e2\u0080%'
   OR body_html LIKE E'%\u00c2\u00a0%'
   OR body_html LIKE E'%\u00ef\u00bb\u00bf%'
   OR body_html LIKE E'%\u00e2\u0098%';

-- Fix body_text in email_logs
UPDATE email_logs
SET body_text = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        body_text,
                        E'\u00e2\u0080\u0094', E'\u2014'
                      ),
                      E'\u00e2\u0080\u0093', E'\u2013'
                    ),
                    E'\u00e2\u0080\u0099', E'\u2019'
                  ),
                  E'\u00e2\u0080\u0098', E'\u2018'
                ),
                E'\u00e2\u0080\u009c', E'\u201c'
              ),
              E'\u00e2\u0080\u009d', E'\u201d'
            ),
            E'\u00e2\u0080\u00a2', E'\u2022'
          ),
          E'\u00e2\u0080\u00a6', E'\u2026'
        ),
        E'\u00c2\u00a0', ' '
      ),
      E'\u00e2\u0098\u0086', E'\u2606'
    ),
    E'\u00e2\u0098\u0085', E'\u2605'
  ),
  E'\u00ef\u00bb\u00bf', ''
)
WHERE body_text IS NOT NULL AND (
  body_text LIKE E'%\u00e2\u0080%'
   OR body_text LIKE E'%\u00c2\u00a0%'
   OR body_text LIKE E'%\u00ef\u00bb\u00bf%'
   OR body_text LIKE E'%\u00e2\u0098%'
);

-- Fix subject in email_logs
UPDATE email_logs
SET subject = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        subject,
                        E'\u00e2\u0080\u0094', E'\u2014'
                      ),
                      E'\u00e2\u0080\u0093', E'\u2013'
                    ),
                    E'\u00e2\u0080\u0099', E'\u2019'
                  ),
                  E'\u00e2\u0080\u0098', E'\u2018'
                ),
                E'\u00e2\u0080\u009c', E'\u201c'
              ),
              E'\u00e2\u0080\u009d', E'\u201d'
            ),
            E'\u00e2\u0080\u00a2', E'\u2022'
          ),
          E'\u00e2\u0080\u00a6', E'\u2026'
        ),
        E'\u00c2\u00a0', ' '
      ),
      E'\u00e2\u0098\u0086', E'\u2606'
    ),
    E'\u00e2\u0098\u0085', E'\u2605'
  ),
  E'\u00ef\u00bb\u00bf', ''
)
WHERE subject IS NOT NULL AND (
  subject LIKE E'%\u00e2\u0080%'
   OR subject LIKE E'%\u00c2\u00a0%'
   OR subject LIKE E'%\u00ef\u00bb\u00bf%'
   OR subject LIKE E'%\u00e2\u0098%'
);
