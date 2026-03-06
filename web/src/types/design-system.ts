export interface DesignSystemData {
  meta: {
    title: string;
    url: string;
    viewport: { width: number; height: number };
    fullHeight: number;
    favicon?: string;
    ogImage?: string;
    description?: string;
  };
  tokens: {
    colors: { hex: string; count: number; usages: string[] }[];
    gradients: { value: string; element: string }[];
    typography: {
      fontSize: string;
      fontWeight: string;
      fontFamily: string;
      lineHeight: string;
      color: string;
      sample: string;
      count: number;
      letterSpacing: string;
      textTransform?: string;
    }[];
    spacing: number[];
    radii: { value: string; count: number }[];
    shadows: { value: string; count: number }[];
    borders: { value: string; count: number }[];
    transitions: { value: string; count: number }[];
  };
  components: {
    id: string;
    type: string;
    subType: string;
    name: string;
    html: string;
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
    svgs: { html: string; viewBox: string; width: number; height: number; title: string; localPath?: string; reuseCount: number }[];
    videos: { tag: string; src: string; width: number; height: number; poster: string }[];
    pseudoElements: { selector: string; parentTag: string; content: string; styles: any }[];
  };
  interactions: {
    hoverStates: { componentId: string; componentType: string; componentName: string; changes: { [key: string]: { from: string; to: string } }; screenshotHover?: string }[];
  };
  cssVariables: { name: string; value: string; selector: string }[];
  fontFaces: { family: string; weight: string; style: string; format?: string; urls?: string[]; localPath?: string; status?: string }[];
  layoutSystem: {
    containerWidths: number[];
  };
  fullPageScreenshot?: string;
}
