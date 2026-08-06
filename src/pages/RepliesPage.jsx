import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useEffectiveOwner } from '../hooks/useEffectiveOwner';
import { useAuth } from '../contexts/AuthContext';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Fix garbled UTF-8 characters from incorrectly encoded emails
const fixEncodingIssues = (content) => {
  if (!content) return content;

  // Use Unicode escapes to avoid build-time parsing issues with special chars
  const replacements = [
    // BOM - must be first
    ['\xef\xbb\xbf', ''],
    ['﻿', ''],
    // Narrow no-break space (U+202F)
    ['\xe2\x80\xaf', ' '], [' ', ' '],
    // Em dash (U+2014)
    ['\xe2\x80\x94', '—'],
    // En dash (U+2013)
    ['\xe2\x80\x93', '–'],
    // Right single quote (U+2019)
    ['\xe2\x80\x99', '’'],
    // Left single quote (U+2018)
    ['\xe2\x80\x98', '‘'],
    // Right double quote (U+201D)
    ['\xe2\x80\x9d', '”'],
    // Left double quote (U+201C)
    ['\xe2\x80\x9c', '“'],
    // Bullet (U+2022)
    ['\xe2\x80\xa2', '•'],
    // Ellipsis (U+2026)
    ['\xe2\x80\xa6', '…'],
    // Stars
    ['\xe2\x98\x86', '☆'],
    ['\xe2\x98\x85', '★'],
    // Non-breaking space issues
    ['\xc2\xa0', ' '],
    ['\xa0', ' '],
    // Accented characters (UTF-8 sequences misread as Latin-1)
    ['\xc3\xa9', '\xe9'], // é
    ['\xc3\xa8', '\xe8'], // è
    ['\xc3\xa0', '\xe0'], // à
    ['\xc3\xa2', '\xe2'], // â
    ['\xc3\xae', '\xee'], // î
    ['\xc3\xb4', '\xf4'], // ô
    ['\xc3\xbb', '\xfb'], // û
    ['\xc3\xa7', '\xe7'], // ç
    ['\xc3\x89', '\xc9'], // É
    ['\xc3\x80', '\xc0'], // À
  ];

  let result = content;
  for (const [bad, good] of replacements) {
    result = result.split(bad).join(good);
  }

  // Regex to catch remaining UTF-8 sequences misread as Latin-1
  result = result.replace(/[\xe2][\x80-\x9f][\x80-\xbf]/g, (match) => {
    const byte2 = match.charCodeAt(1);
    const byte3 = match.charCodeAt(2);
    const codePoint = ((0xe2 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
    const map = {
      0x2014: '—', 0x2013: '–', 0x2019: "'", 0x2018: "'",
      0x201c: '"', 0x201d: '"', 0x2022: '•', 0x2026: '...', 0x202f: ' ',
    };
    return map[codePoint] || ' ';
  });

  return result;
};

// One-line plain-text snippet of a reply body
const getSnippet = (reply) => {
  const raw = reply.body_text || (reply.body_html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ');
  const text = fixEncodingIssues(raw || '').replace(/\s+/g, ' ').trim();
  return text.length > 140 ? text.substring(0, 140) + '...' : text;
};

// Reply Preview Modal
const ReplyPreviewModal = ({ reply, accountName, theme: t, userId, onClose }) => {
  if (!reply) return null;

  const htmlContent = reply.body_html ? fixEncodingIssues(reply.body_html) : null;
  const textContent = reply.body_text ? fixEncodingIssues(reply.body_text) : null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
            Reply
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: t.textSecondary,
              padding: '4px 8px'
            }}
          >{'✕'}</button>
        </div>

        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          backgroundColor: t.bg
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: t.textSecondary }}>From:</span>
            <span style={{ color: t.text }}>
              {reply.from_name || 'Unknown'} &lt;{reply.from_email || 'unknown'}&gt;
              {reply.sender_verified === false && (
                <span style={{
                  marginLeft: '8px',
                  padding: '2px 8px',
                  backgroundColor: `${t.warning}20`,
                  color: t.warning,
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '500'
                }}>
                  Unverified sender
                </span>
              )}
            </span>
            {accountName && (
              <>
                <span style={{ color: t.textSecondary }}>Account:</span>
                <span style={{ color: t.text }}>{accountName}</span>
              </>
            )}
            <span style={{ color: t.textSecondary }}>Subject:</span>
            <span style={{ color: t.text, fontWeight: '500' }}>{fixEncodingIssues(reply.subject) || 'No subject'}</span>
            <span style={{ color: t.textSecondary }}>Received:</span>
            <span style={{ color: t.text }}>
              {reply.received_at ? new Date(reply.received_at).toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              }) : 'Unknown'}
            </span>
          </div>
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff'
        }}>
          {htmlContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333' }}
            />
          ) : textContent ? (
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6', color: '#333', whiteSpace: 'pre-wrap' }}>
              {textContent}
            </div>
          ) : (
            <div style={{ color: t.textMuted, textAlign: 'center', padding: '40px', fontSize: '14px' }}>
              No reply content available
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          {reply.account_id && (
            <Link
              to={`/${userId}/accounts/${reply.account_id}`}
              style={{
                padding: '8px 16px',
                backgroundColor: t.primary,
                border: `1px solid ${t.primary}`,
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                textDecoration: 'none'
              }}
            >
              View Client
            </Link>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.text,
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Main page component
const RepliesPage = ({ t }) => {
  const { userId } = useParams();
  const { ownerIds, filterKey } = useEffectiveOwner();
  const { isAdmin, isViewingFiltered } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReply, setSelectedReply] = useState(null);

  // Master admins with no scope filter active see all replies system-wide.
  // getEffectiveOwnerIds() falls back to the admin's own id, which owns no
  // replies — so skip the owner filter entirely in that case.
  const showAllReplies = isAdmin && !isViewingFiltered();

  // Fetch replies for the effective owner(s)
  const { data: replies, isLoading } = useQuery({
    queryKey: ['emailReplies', showAllReplies ? 'all' : filterKey],
    queryFn: async () => {
      let query = supabase
        .from('email_replies')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200);
      if (!showAllReplies) {
        query = query.in('owner_id', ownerIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: showAllReplies || ownerIds.length > 0
  });

  // Batch-fetch account names for the replies
  const accountIds = useMemo(
    () => [...new Set((replies || []).map(r => r.account_id).filter(Boolean))],
    [replies]
  );

  const { data: accountMap } = useQuery({
    queryKey: ['emailReplies', filterKey, 'accounts', accountIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('account_unique_id, name')
        .in('account_unique_id', accountIds);
      if (error) throw error;
      const map = {};
      (data || []).forEach(a => { map[a.account_unique_id] = a.name; });
      return map;
    },
    enabled: accountIds.length > 0
  });

  // Client-side search across sender, subject, and account name
  const filteredReplies = useMemo(() => {
    if (!replies) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return replies;
    return replies.filter(r => {
      const accountName = (r.account_id && accountMap?.[r.account_id]) || '';
      return (
        (r.from_email || '').toLowerCase().includes(q) ||
        (r.from_name || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q) ||
        accountName.toLowerCase().includes(q)
      );
    });
  }, [replies, accountMap, searchQuery]);

  const totalCount = replies?.length || 0;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
          Replies
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
          {isLoading
            ? 'Loading replies...'
            : `${totalCount} ${totalCount === 1 ? 'reply' : 'replies'}`}
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by sender, subject, or account..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '10px 12px',
            fontSize: '14px',
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            backgroundColor: t.bgInput,
            color: t.text,
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Reply list */}
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ padding: '14px', backgroundColor: t.bg, borderRadius: '8px' }}>
                <Skeleton height="12px" width="150px" />
                <div style={{ marginTop: '8px' }}><Skeleton height="16px" width="250px" /></div>
                <div style={{ marginTop: '4px' }}><Skeleton height="12px" width="200px" /></div>
              </div>
            ))}
          </div>
        ) : filteredReplies.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredReplies.map((reply, index) => {
              const accountName = reply.account_id ? accountMap?.[reply.account_id] : null;
              const snippet = getSnippet(reply);

              return (
                <div
                  key={reply.id}
                  onClick={() => setSelectedReply(reply)}
                  style={{
                    padding: '16px 20px',
                    borderTop: index > 0 ? `1px solid ${t.border}` : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = t.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: t.text }}>
                        {reply.from_name || reply.from_email || 'Unknown sender'}
                      </span>
                      {reply.sender_verified === false && (
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: `${t.warning}20`,
                          color: t.warning,
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          Unverified sender
                        </span>
                      )}
                    </div>

                    {accountName && (
                      <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '2px' }}>
                        {accountName}
                      </div>
                    )}

                    <div style={{
                      fontSize: '13px',
                      color: t.textSecondary,
                      marginTop: '2px',
                      fontWeight: '500',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {fixEncodingIssues(reply.subject) || 'No subject'}
                    </div>

                    {snippet && (
                      <div style={{
                        fontSize: '12px',
                        color: t.textMuted,
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {snippet}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: '11px', color: t.textMuted, flexShrink: 0 }}>
                    {reply.received_at ? new Date(reply.received_at).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    }) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: t.textMuted,
            fontSize: '14px'
          }}>
            {searchQuery.trim() ? (
              <>
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>No matching replies</div>
                <div>No replies match "{searchQuery.trim()}".</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: '500', marginBottom: '4px' }}>No replies yet</div>
                <div>When clients reply to your tracked emails, their replies will appear here.</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {selectedReply && (
        <ReplyPreviewModal
          reply={selectedReply}
          accountName={selectedReply.account_id ? accountMap?.[selectedReply.account_id] : null}
          theme={t}
          userId={userId}
          onClose={() => setSelectedReply(null)}
        />
      )}
    </div>
  );
};

export default RepliesPage;
