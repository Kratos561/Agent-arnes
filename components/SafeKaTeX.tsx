'use client';

import React from 'react';
import katex from 'katex';

interface SafeKaTeXProps {
  math: string;
  inline?: boolean;
}

export class SafeKaTeX extends React.Component<SafeKaTeXProps, { hasError: boolean }> {
  constructor(props: SafeKaTeXProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    const { math, inline = true } = this.props;

    if (this.state.hasError) {
      return (
        <code className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-xs">
          {inline ? `$${math}$` : `$$${math}$$`}
        </code>
      );
    }

    try {
      const html = katex.renderToString(math, {
        displayMode: !inline,
        throwOnError: false,
        strict: false,
      });

      return (
        <span
          dangerouslySetInnerHTML={{ __html: html }}
          className={inline ? 'inline-math' : 'block-math my-2 block overflow-x-auto'}
        />
      );
    } catch {
      return (
        <code className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-mono text-xs">
          {math}
        </code>
      );
    }
  }
}
