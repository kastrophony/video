// Custom element IntrinsicElements declarations for remix/component JSX.
// Allows using org-atsui-* and at-inlay-* custom elements in .tsx files.

export type CacheTag = {
  $type: string;
  uri?: string;
  subject?: string;
  from?: string;
};

export type CachePolicy = {
  life?: string;
  tags?: CacheTag[];
};

type CustomElementProps = Record<string, unknown>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "at-inlay-root": CustomElementProps;
      "org-atsui-stack": CustomElementProps;
      "org-atsui-row": CustomElementProps;
      "org-atsui-fill": CustomElementProps;
      "org-atsui-grid": CustomElementProps;
      "org-atsui-clip": CustomElementProps;
      "org-atsui-cover": CustomElementProps;
      "org-atsui-avatar": CustomElementProps;
      "org-atsui-blob": CustomElementProps;
      "org-atsui-title": CustomElementProps;
      "org-atsui-heading": CustomElementProps;
      "org-atsui-text": CustomElementProps;
      "org-atsui-caption": CustomElementProps;
      "org-atsui-timestamp": CustomElementProps;
      "org-atsui-link": CustomElementProps;
      "org-atsui-card": CustomElementProps;
      "org-atsui-tabs": CustomElementProps;
    }
  }
}

export {};
