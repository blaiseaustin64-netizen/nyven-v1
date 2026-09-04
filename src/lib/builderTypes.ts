export interface WebsiteSpec {
  project: {
    name: string
    slug: string
    description: string
    websiteType: string
    style: string
  }
  design: {
    primaryColor: string
    secondaryColor: string
    backgroundColor: string
    textColor: string
    fontDirection: string
    visualDirection: string
  }
  pages: string[]
  sections: string[]
  features: string[]
  content: Record<string, unknown>
  responsive: {
    mobile: boolean
    tablet: boolean
    desktop: boolean
  }
}

export interface GeneratedFiles {
  html: string
  css: string
  js: string
}

export interface NyvenProject {
  id: string
  name: string
  slug: string
  description: string
  websiteType: string
  style: string
  features: string[]
  spec: WebsiteSpec
  files: GeneratedFiles
  createdAt: string
  updatedAt: string
}
