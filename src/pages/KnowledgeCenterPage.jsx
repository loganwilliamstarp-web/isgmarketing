import React, { useState, useEffect } from 'react';

const KnowledgeCenterPage = ({ t }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('');

  const sections = [
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'navigation--layout', label: 'Navigation & Layout', icon: '🗺️' },
    { id: 'dashboard-overview', label: 'Dashboard Overview', icon: '📊' },
    { id: 'creating-email-templates', label: 'Creating Email Templates', icon: '📝' },
    { id: 'setting-up-automations', label: 'Setting Up Automations', icon: '⚡' },
    { id: 'running-mass-email-campaigns', label: 'Mass Email Campaigns', icon: '📧' },
    { id: 'managing-accounts--clients', label: 'Managing Accounts', icon: '👥' },
    { id: 'settings--configuration', label: 'Settings & Configuration', icon: '⚙️' },
    { id: 'user-roles--permissions', label: 'User Roles & Permissions', icon: '🔐' },
    { id: 'tips--best-practices', label: 'Tips & Best Practices', icon: '💡' },
  ];

  useEffect(() => {
    fetch('/docs/USER_GUIDE.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error loading user guide:', err);
        setIsLoading(false);
      });
  }, []);

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Simple markdown to HTML converter for code blocks and basic formatting
  const renderMarkdown = (text) => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        // Code block
        const code = part.replace(/```\w*\n?/g, '').replace(/```$/g, '');
        return (
          <pre
            key={index}
            style={{
              backgroundColor: t.bgHover,
              padding: '16px',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '12px',
              lineHeight: '1.5',
              fontFamily: "'SF Mono', 'Consolas', 'Monaco', monospace",
              border: `1px solid ${t.border}`,
              margin: '16px 0',
              whiteSpace: 'pre',
            }}
          >
            {code}
          </pre>
        );
      } else {
        // Regular markdown
        const lines = part.split('\n');
        return lines.map((line, lineIndex) => {
          // Headers
          if (line.startsWith('# ')) {
            const id = line.slice(2).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
            return (
              <h1
                key={`${index}-${lineIndex}`}
                id={id}
                style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: t.text,
                  marginTop: lineIndex === 0 ? 0 : '32px',
                  marginBottom: '16px',
                  paddingTop: '16px',
                }}
              >
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            const id = line.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
            return (
              <h2
                key={`${index}-${lineIndex}`}
                id={id}
                style={{
                  fontSize: '22px',
                  fontWeight: '600',
                  color: t.text,
                  marginTop: '28px',
                  marginBottom: '12px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${t.border}`,
                }}
              >
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('### ')) {
            return (
              <h3
                key={`${index}-${lineIndex}`}
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: t.text,
                  marginTop: '20px',
                  marginBottom: '8px',
                }}
              >
                {line.slice(4)}
              </h3>
            );
          }
          if (line.startsWith('#### ')) {
            return (
              <h4
                key={`${index}-${lineIndex}`}
                style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: t.text,
                  marginTop: '16px',
                  marginBottom: '8px',
                }}
              >
                {line.slice(5)}
              </h4>
            );
          }

          // Horizontal rule
          if (line.match(/^-{3,}$/)) {
            return <hr key={`${index}-${lineIndex}`} style={{ border: 'none', borderTop: `1px solid ${t.border}`, margin: '24px 0' }} />;
          }

          // Blockquotes
          if (line.startsWith('> ')) {
            return (
              <blockquote
                key={`${index}-${lineIndex}`}
                style={{
                  borderLeft: `4px solid ${t.primary}`,
                  paddingLeft: '16px',
                  margin: '16px 0',
                  color: t.textSecondary,
                  fontStyle: 'italic',
                }}
              >
                {line.slice(2)}
              </blockquote>
            );
          }

          // Table rows (simple detection)
          if (line.startsWith('|') && line.endsWith('|')) {
            const cells = line.split('|').filter(cell => cell.trim());
            const isHeader = lines[lineIndex + 1]?.match(/^\|[-:\s|]+\|$/);
            const isSeparator = line.match(/^\|[-:\s|]+\|$/);

            if (isSeparator) return null;

            return (
              <div
                key={`${index}-${lineIndex}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
                  gap: '1px',
                  backgroundColor: t.border,
                  border: `1px solid ${t.border}`,
                  borderRadius: lineIndex === 0 ? '8px 8px 0 0' : '0',
                }}
              >
                {cells.map((cell, cellIndex) => (
                  <div
                    key={cellIndex}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: isHeader ? t.bgHover : t.bgCard,
                      fontSize: '13px',
                      fontWeight: isHeader ? '600' : '400',
                      color: t.text,
                    }}
                  >
                    {cell.trim().replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1')}
                  </div>
                ))}
              </div>
            );
          }

          // List items
          if (line.match(/^[-*] /)) {
            return (
              <div
                key={`${index}-${lineIndex}`}
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '4px',
                  paddingLeft: '8px',
                }}
              >
                <span style={{ color: t.primary }}>•</span>
                <span style={{ color: t.textSecondary, fontSize: '14px' }}>
                  {formatInlineMarkdown(line.slice(2), t)}
                </span>
              </div>
            );
          }

          // Numbered list
          if (line.match(/^\d+\. /)) {
            const num = line.match(/^(\d+)\./)[1];
            return (
              <div
                key={`${index}-${lineIndex}`}
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '4px',
                  paddingLeft: '8px',
                }}
              >
                <span style={{ color: t.primary, fontWeight: '600', minWidth: '20px' }}>{num}.</span>
                <span style={{ color: t.textSecondary, fontSize: '14px' }}>
                  {formatInlineMarkdown(line.replace(/^\d+\.\s*/, ''), t)}
                </span>
              </div>
            );
          }

          // Empty lines
          if (line.trim() === '') {
            return <div key={`${index}-${lineIndex}`} style={{ height: '8px' }} />;
          }

          // Regular paragraph
          return (
            <p
              key={`${index}-${lineIndex}`}
              style={{
                color: t.textSecondary,
                fontSize: '14px',
                lineHeight: '1.6',
                margin: '8px 0',
              }}
            >
              {formatInlineMarkdown(line, t)}
            </p>
          );
        });
      }
    });
  };

  const formatInlineMarkdown = (text, t) => {
    // Handle bold, italic, code, and links
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
      // Code
      const codeMatch = remaining.match(/`([^`]+)`/);

      const matches = [
        boldMatch ? { type: 'bold', match: boldMatch, index: remaining.indexOf(boldMatch[0]) } : null,
        codeMatch ? { type: 'code', match: codeMatch, index: remaining.indexOf(codeMatch[0]) } : null,
      ].filter(Boolean).sort((a, b) => a.index - b.index);

      if (matches.length === 0) {
        parts.push(remaining);
        break;
      }

      const firstMatch = matches[0];

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      if (firstMatch.type === 'bold') {
        parts.push(
          <strong key={key++} style={{ fontWeight: '600', color: t.text }}>
            {firstMatch.match[1]}
          </strong>
        );
      } else if (firstMatch.type === 'code') {
        parts.push(
          <code
            key={key++}
            style={{
              backgroundColor: t.bgHover,
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: "'SF Mono', 'Consolas', monospace",
              color: t.primary,
            }}
          >
            {firstMatch.match[1]}
          </code>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
    }

    return parts;
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
          📚 Knowledge Center
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px' }}>
          Learn how to use the Email Automation Marketing System
        </p>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Sidebar Navigation */}
        <div
          style={{
            width: '240px',
            flexShrink: 0,
            position: 'sticky',
            top: '24px',
            alignSelf: 'flex-start',
          }}
        >
          <div
            style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              padding: '16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: '600',
                color: t.textMuted,
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Quick Navigation
            </div>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: activeSection === section.id ? `${t.primary}15` : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: activeSection === section.id ? t.primary : t.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: activeSection === section.id ? '600' : '400',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '2px',
                }}
              >
                <span>{section.icon}</span>
                {section.label}
              </button>
            ))}
          </div>

          {/* Download Link */}
          <a
            href="/docs/USER_GUIDE.md"
            download="ISG_Email_Automation_User_Guide.md"
            style={{
              display: 'flex',
              width: '100%',
              padding: '12px 16px',
              backgroundColor: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
              textAlign: 'center',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '12px',
              textDecoration: 'none',
            }}
          >
            <span>📥</span> Download Guide
          </a>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            padding: '32px',
            minHeight: '600px',
          }}
        >
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: t.textMuted }}>
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
              Loading documentation...
            </div>
          ) : content ? (
            <div style={{ maxWidth: '800px' }}>{renderMarkdown(content)}</div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', color: t.textMuted }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
              <p>Unable to load documentation.</p>
              <a
                href="/docs/USER_GUIDE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: t.primary, marginTop: '8px', display: 'inline-block' }}
              >
                Open documentation directly →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeCenterPage;
