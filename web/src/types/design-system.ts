export interface DesignSystemData {
  meta: {
    title: string;
    url: string;
    viewport: { width: number; height: number };
    fullHeight: number;
  };
  tokens: {
    colors: { hex: string; count: number; usages: string[] }[];
    typography: { fontSize: string; fontWeight: string; fontFamily: string; lineHeight: string; color: string; sample: string; count: number; letterSpacing: string; }[];
    spacing: number[];
    radii: { value: string; count: number }[];
    shadows: { value: string; count: number }[];
  };
  components: {
    id: string;
    type: string;
    subType: string;
    name: string;
    html: string;
    cleanHtml: string;
    rect: { width: number; height: number; x: number; y: number };
    styles: { [key: string]: string };
    dataAttributes: { [key: string]: string };
    signature: string;
    structuralSignature: string;
    children: string[];
    parentId: string | null;
    patternId: string | null;
    instanceIndex: number;
    screenshot?: string;
  }[];
  patterns: {
    id: string;
    name: string;
    type: string;
    instanceCount: number;
    structure: string;
    componentIds: string[];
    templateHtml: string;
  }[];
  sections: {
    id: string;
    name: string;
    tag: string;
    rect: { width: number; height: number; x: number; y: number };
    textPreview: string;
    styles: { [key: string]: string };
    dataAttributes: { [key: string]: string };
    childComponentIds: string[];
    screenshot?: string;
  }[];
  assets: {
    images: { src: string; alt: string; width: number; height: number; localPath?: string }[];
    svgs: { html: string; viewBox: string; width: number; height: number; title: string; localPath?: string }[];
  };
  fullPageScreenshot?: string;
}
