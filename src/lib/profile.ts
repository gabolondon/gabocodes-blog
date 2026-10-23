// Gabriel's professional profile: the data behind /profile (and the short summary on /about).
// Plain data on purpose: later this becomes the high-level knowledge base of his experience,
// updated as new posts land. Reader-facing: no employer internals, only what the blog already says.

export interface Role {
  title: string;
  org: string;
  place?: string;
  start: string; // "Oct 2023"
  end: string; // "present" or "Sep 2023"
  summary?: string;
  points: string[];
  stack?: string[];
}

export interface SkillGroup {
  name: string;
  items: string[];
}

export const PROFILE = {
  name: 'Gabriel Londoño',
  headline: 'Software engineer · Electronics engineer',
  problem: 'Profile · LLM agents in production',
  location: 'Colombia · remote',
  summary:
    'Software engineer building LLM agents and the systems around them in production. I came to software from electronics: seven years running a technology department and programming control systems, then full-stack web and mobile work, and for the last three years AI agents at a health-AI startup. I care about measuring before optimizing, and about shipping the boring parts that make an agent trustworthy: evaluation, caching, streaming and safe deployments.',
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/gabriel-londo%C3%B1o-218443107/' },
    { label: 'GitHub', href: 'https://github.com/gabolondon' },
  ],
  experience: [
    {
      title: 'Software Engineer',
      org: 'Omniscope',
      start: 'Oct 2023',
      end: 'present',
      summary: 'Health-AI startup. I own an LLM assistant in the product, from the agent to its evaluation and deployment.',
      points: [
        'Upgraded a production LLM agent: replaced a planner and specialist sub-agents with a small triage model and one agent with direct tools, a model per role, streaming responses and a cache for the report that opens every chat.',
        'Built the evaluation benchmark the team did not have: scripted conversations, expert rules checked by an LLM judge that sees the evidence and votes three times. Production against the release: correct answers from 37 to 57 of 61, and the questions that took up to 170 s answered in 22 to 28 s.',
        'Found and closed an access gap in a deployment where an old open rule overrode the restrictive one; added the check so a stranger without credentials gets nothing.',
        'Work daily with AI coding agents (Claude Code and others) as part of the engineering team: planning, sub-agent research, reviews and test-first changes.',
      ],
      stack: ['Python', 'LLM agents', 'LLM-as-judge', 'Streaming APIs', 'Docker', 'Cloud deployments'],
    },
    {
      title: 'Full-stack application developer',
      org: 'Circuloten',
      place: 'Chile (remote)',
      start: '2023',
      end: 'Sep 2023',
      points: [
        'Built React Native features in TypeScript from Figma designs: chat (WebSockets, WatermelonDB local storage), social wall, video uploads to S3, pedometer with Apple HealthKit and Google Fit.',
        'Built and maintained Django REST APIs, deployed with Docker Compose and Bitbucket Pipelines.',
      ],
      stack: ['React Native', 'TypeScript', 'Redux', 'Django REST', 'Docker Compose', 'AWS S3'],
    },
    {
      title: 'Technology and Maintenance Manager',
      org: 'Vision Total S.A.S.',
      place: 'Colombia',
      start: '2015',
      end: '2023',
      points: [
        'Led the technology department of a medical facility: servers, networks, backups and regulatory compliance for medical equipment.',
        'Co-built a telemedicine app for rural consultations (React Native, Django, MySQL) and a CMMS for maintenance and inventory (Angular, Django).',
        'Designed replacement control boards with STM32, Arduino and Raspberry Pi, including a foot-pedal lens drive for a surgical microscope.',
        'Cut equipment failures by 80% with a preventive maintenance program and raised on-time maintenance to 95%.',
      ],
      stack: ['React Native', 'Angular', 'Django', 'MySQL', 'STM32', 'PLC / SCADA / HMI'],
    },
  ] satisfies Role[],
  projects: [
    {
      name: 'This blog',
      href: '/',
      text: 'Deep dives on LLM systems in production, each with example code you can run. Astro on Cloudflare Pages.',
    },
    {
      name: 'agent-upgrade-demo',
      href: 'https://github.com/gabolondon/agent-upgrade-demo',
      text: 'A slow LLM agent and an upgraded one side by side, measured with a benchmark and an LLM judge. FastAPI, LangGraph, nginx, Docker Compose.',
    },
    {
      name: 'A writing pipeline for engineers',
      text: 'A personal Claude Code plugin that turns git history and coding-agent sessions into technical writing, with an IP gate before anything is published. Python, shell, subagents, a small n8n + Baserow queue on a Raspberry Pi.',
    },
  ],
  skills: [
    { name: 'LLM engineering', items: ['Agents (LangGraph)', 'Evaluation and LLM-as-judge', 'Caching and latency', 'Streaming', 'Prompt and tool design', 'OpenRouter', 'Local models (Ollama)'] },
    { name: 'AI coding tools', items: ['Claude Code', 'OpenCode', 'Gemini CLI', 'Antigravity', 'ChatGPT'] },
    { name: 'Backend', items: ['Python', 'FastAPI', 'Django REST', 'PostgreSQL', 'MySQL'] },
    { name: 'Infrastructure', items: ['Docker / Compose', 'nginx', 'GCP', 'AWS', 'Cloudflare (Pages, Access, Tunnels)', 'CI pipelines'] },
    { name: 'Frontend and mobile', items: ['TypeScript', 'React', 'React Native', 'Angular', 'Astro'] },
    { name: 'Electronics', items: ['PLC, SCADA, HMI', 'STM32', 'Arduino', 'Raspberry Pi'] },
  ] satisfies SkillGroup[],
  education: [
    { title: 'Diploma in Maintenance Management', org: 'Universidad Tecnológica de Bolívar, Cartagena', year: '2021' },
    { title: 'Industrial Instrumentation & Control (award program)', org: 'Universidad Pontificia Bolivariana, Montería', year: '2013' },
    { title: 'B.Sc. Electronics Engineering & Control', org: 'Universidad Pontificia Bolivariana, Montería', year: '2013' },
  ],
  certificates: [
    { title: 'Introduction to Cybersecurity Careers', org: 'IBM · Coursera', year: '2026', href: 'https://coursera.org/verify/GXWZOLA2E59H' },
    { title: 'Meta Front-End Developer Professional Certificate (9 courses)', org: 'Meta · Coursera', year: '2024', href: 'https://coursera.org/verify/professional-cert/FI8G0YNMWN7X' },
  ] as { title: string; org: string; year: string; href?: string }[],
};
