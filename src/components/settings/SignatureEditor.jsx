// src/components/settings/SignatureEditor.jsx
import React, { useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const SignatureEditor = ({ value, onChange, theme: t }) => {
  // Quill toolbar configuration - email-friendly options
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['link'],
      ['clean']
    ]
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline',
    'color', 'background',
    'align',
    'link'
  ];

  return (
    <div className="signature-editor-wrapper">
      <style>{`
        .signature-editor-wrapper .quill {
          background: ${t.bgInput};
          border-radius: 8px;
          border: 1px solid ${t.border};
        }
        .signature-editor-wrapper .ql-toolbar {
          border: none;
          border-bottom: 1px solid ${t.border};
          background: ${t.bgHover};
          border-radius: 8px 8px 0 0;
        }
        .signature-editor-wrapper .ql-container {
          border: none;
          font-family: Arial, sans-serif;
          font-size: 14px;
          min-height: 200px;
        }
        .signature-editor-wrapper .ql-editor {
          min-height: 200px;
          color: ${t.text};
        }
        .signature-editor-wrapper .ql-editor.ql-blank::before {
          color: ${t.textMuted};
          font-style: normal;
        }
        .signature-editor-wrapper .ql-stroke {
          stroke: ${t.textSecondary};
        }
        .signature-editor-wrapper .ql-fill {
          fill: ${t.textSecondary};
        }
        .signature-editor-wrapper .ql-picker {
          color: ${t.textSecondary};
        }
        .signature-editor-wrapper .ql-picker-options {
          background: ${t.bgCard};
          border-color: ${t.border};
        }
        .signature-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .signature-editor-wrapper .ql-toolbar button.ql-active .ql-stroke {
          stroke: ${t.primary};
        }
        .signature-editor-wrapper .ql-toolbar button:hover .ql-fill,
        .signature-editor-wrapper .ql-toolbar button.ql-active .ql-fill {
          fill: ${t.primary};
        }
        .signature-editor-wrapper .ql-toolbar button:hover,
        .signature-editor-wrapper .ql-toolbar button.ql-active {
          color: ${t.primary};
        }
      `}</style>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder="Design your email signature here..."
      />
    </div>
  );
};

export default SignatureEditor;
