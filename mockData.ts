import type { Conversation, Project, Message } from './types'

export const mockProjects: Project[] = [
  {
    id: 'p1',
    name: 'Lumina Restaurant',
    type: 'Restaurant',
    lastEdited: '2 hours ago',
    description: 'Luxury fine-dining experience with reservation system',
  },
  {
    id: 'p2',
    name: 'Aether Portfolio',
    type: 'Portfolio',
    lastEdited: 'Yesterday',
    description: 'Minimal creative portfolio for a digital artist',
  },
  {
    id: 'p3',
    name: 'Nova SaaS Landing',
    type: 'SaaS',
    lastEdited: '3 days ago',
    description: 'Product landing page with pricing and features',
  },
  {
    id: 'p4',
    name: 'Velvet Boutique',
    type: 'E-commerce',
    lastEdited: '1 week ago',
    description: 'Elegant fashion storefront with product gallery',
  },
]

export const mockConversations: Conversation[] = [
  {
    id: 'c1',
    title: 'Website ideas for a café',
    updatedAt: Date.now() - 1000 * 60 * 30,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'I want to create a warm, modern website for a specialty coffee shop.',
        timestamp: Date.now() - 1000 * 60 * 35,
      },
      {
        id: 'm2',
        role: 'nyven',
        content:
          "That sounds lovely. A specialty coffee shop benefits from a design that feels inviting yet refined — warm tones, clear hierarchy, and photography that captures the craft.\n\nI can help you shape the structure: homepage with atmosphere, menu, story, and a simple reservation or order flow. Would you like to start with the overall mood, or jump straight into a layout?",
        timestamp: Date.now() - 1000 * 60 * 34,
      },
    ],
  },
  {
    id: 'c2',
    title: 'Explain quantum computing simply',
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    messages: [],
  },
  {
    id: 'c3',
    title: 'Draft a product launch email',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    messages: [],
  },
]

export const mockNyvenResponses: Record<string, string> = {
  default:
    "I'm here to help you think, create, and build. What would you like to explore?",
  greeting:
    "Welcome. I'm NYVEN — ready to help you create, code, or think through whatever is next.",
  build:
    "I can help you design and structure a website from your description. Tell me more about the experience you want to create, and I'll guide the process.",
  code:
    "I can assist with architecture, code structure, debugging, or explaining concepts clearly. Share what you're working on.",
  creative:
    "Let's explore ideas together. Describe the direction or feeling you're aiming for, and I'll help refine it.",
}

export function generateMockResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase()
  if (lower.includes('build') || lower.includes('website') || lower.includes('site')) {
    return "I understand you want to create a website. I can help you shape the concept, structure, visual direction, and content approach.\n\nDescribe the purpose, audience, and the feeling you want visitors to experience. From there we can move into layout and components."
  }
  if (lower.includes('code') || lower.includes('function') || lower.includes('react') || lower.includes('typescript')) {
    return "I can help with that. Share the specific problem, language, or snippet you're working with, and I'll walk through a clear solution or improvement."
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return mockNyvenResponses.greeting
  }
  if (lower.includes('create') || lower.includes('design') || lower.includes('idea')) {
    return mockNyvenResponses.creative
  }
  return "That's an interesting direction. Tell me more about what you're aiming for — the goal, constraints, or the feeling you want — and I'll help you move forward with clarity."
}

export const builderPhases = [
  { key: 'understanding', label: 'Understanding your idea...' },
  { key: 'planning', label: 'Planning the experience...' },
  { key: 'designing', label: 'Designing the structure...' },
  { key: 'building', label: 'Building your website...' },
  { key: 'writing', label: 'Writing the code...' },
  { key: 'rendering', label: 'Rendering the preview...' },
  { key: 'ready', label: 'Your website is ready.' },
] as const
