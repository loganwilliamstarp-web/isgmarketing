-- Fix garbled UTF-8 characters in email_logs body_html and body_text
-- These characters were incorrectly encoded due to missing charset declaration

-- Common encoding issues to fix:
-- â€" -> — (em dash)
-- â€" -> – (en dash)
-- â€™ -> ' (right single quote / apostrophe)
-- â€˜ -> ' (left single quote)
-- â€œ -> " (left double quote)
-- â€ -> " (right double quote)
-- â€¢ -> • (bullet)
-- â€¦ -> … (ellipsis)
-- Â  -> (non-breaking space, remove the Â)
-- â˜† -> ☆ (empty star)
-- â˜… -> ★ (filled star)
-- â€" -> — (another em dash variant)

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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_html LIKE '%â€%'
   OR body_html LIKE '%Â %'
   OR body_html LIKE '%ï»¿%'
   OR body_html LIKE '%â˜%';

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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_text LIKE '%â€%'
   OR body_text LIKE '%Â %'
   OR body_text LIKE '%ï»¿%'
   OR body_text LIKE '%â˜%';

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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE subject LIKE '%â€%'
   OR subject LIKE '%Â %'
   OR subject LIKE '%ï»¿%'
   OR subject LIKE '%â˜%';

-- Also fix email_templates in case any were saved with bad encoding
UPDATE email_templates
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_html LIKE '%â€%'
   OR body_html LIKE '%Â %'
   OR body_html LIKE '%ï»¿%'
   OR body_html LIKE '%â˜%';

UPDATE email_templates
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_text LIKE '%â€%'
   OR body_text LIKE '%Â %'
   OR body_text LIKE '%ï»¿%'
   OR body_text LIKE '%â˜%';

UPDATE email_templates
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE subject LIKE '%â€%'
   OR subject LIKE '%Â %'
   OR subject LIKE '%ï»¿%'
   OR subject LIKE '%â˜%';

-- Fix scheduled_emails as well
UPDATE scheduled_emails
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_html LIKE '%â€%'
   OR body_html LIKE '%Â %'
   OR body_html LIKE '%ï»¿%'
   OR body_html LIKE '%â˜%';

UPDATE scheduled_emails
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE body_text LIKE '%â€%'
   OR body_text LIKE '%Â %'
   OR body_text LIKE '%ï»¿%'
   OR body_text LIKE '%â˜%';

UPDATE scheduled_emails
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
                        'â€"', '—'
                      ),
                      'â€"', '–'
                    ),
                    'â€™', '''
                  ),
                  'â€˜', '''
                ),
                'â€œ', '"'
              ),
              'â€', '"'
            ),
            'â€¢', '•'
          ),
          'â€¦', '…'
        ),
        'Â ', ' '
      ),
      'â˜†', '☆'
    ),
    'â˜…', '★'
  ),
  'ï»¿', ''
)
WHERE subject LIKE '%â€%'
   OR subject LIKE '%Â %'
   OR subject LIKE '%ï»¿%'
   OR subject LIKE '%â˜%';
