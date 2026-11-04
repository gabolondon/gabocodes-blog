// Gabriel's professional profile: the data behind /profile (and the short summary on /about).
// Plain data on purpose: later this becomes the high-level knowledge base of his experience,
// updated as new posts land. Reader-facing: no employer internals, only details suitable for public use.

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

interface Project {
  name: string;
  href?: string;
  text: string;
  links?: { label: string; href: string }[];
}

export const PROFILE = {
  name: 'Gabriel Londoño',
  headline: 'Software engineer · Electronics engineer',
  problem: 'Profile · LLM agents in production',
  location: 'Colombia · remote',
  summary:
    'I build AI agents and the backend systems that keep them useful in production. At Omniscope, I work on Python APIs, Google Cloud, agent evaluation and private model serving. My background spans electronics, healthcare technology operations and full-stack development. I also deploy agents that connect to the tools and data small businesses already use.',
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
      summary: 'I build and maintain AI agents and the systems that support them at a health AI company.',
      points: [
        'Contributed backend data integration to ImmuneGPT while working with Google engineers and took over maintenance and upgrades after handoff. The assistant answers questions about immune profiles and grounds its answers in scientific literature. I also deploy Python services, build agents with Google ADK and maintain retrieval workflows on Vertex AI.',
        'Refactored production agent orchestration and built a multi-turn evaluation suite with expert-defined criteria and an LLM judge that checks the available evidence. In an anonymized release benchmark, correct answers rose from 37 to 57 out of 61 and p95 answer latency fell from 46.3 to 30.7 seconds. The upgrade simplified orchestration, cached an expensive opening response and streamed answers.',
        'Meet with lab and business teams to identify operational needs, configure agents and help colleagues build their own. I connect local and existing AI tools to services such as HubSpot and Google Workspace, including Gmail, for workflows such as invoice review and billing.',
        'Built a private RAG platform that is now in an internal pilot. It incrementally indexes structured and unstructured documents, combines semantic and keyword search, and cites original sources. Agents can access it through MCP or an API.',
        'Designed and deployed private inference for open-weight language models, speech recognition and speech synthesis. I benchmarked model and hardware configurations, integrated model serving with access controls, packaged Hermes for desktop use and built a web interface for executives.',
        'Closed a deployment access gap and added a check to verify that unauthenticated requests are denied.',
        'Use AI coding agents in daily engineering work, including planning, research, reviews and test-first changes.',
      ],
      stack: ['Python', 'Google Cloud', 'Google ADK', 'Vertex AI', 'MCP', 'LLM-as-judge', 'Docker'],
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
    {
      name: 'Healthcare invoice review',
      text: 'Deployed a Hermes agent for a clinic to review invoices before submission to a payer. It connects to internal services and runs a local language model on a clinic-managed server. The workflow is in use and its review rules are still being tuned.',
    },
    {
      name: 'Fitness coaching operations',
      text: 'Migrated spreadsheet records into Airtable for a fitness business coaching agency and connected Airtable, Basecamp and Hermes through APIs. The prototype used Baserow. Airtable now serves as the main data store, and Dropbox integration is being explored.',
    },
    {
      name: 'Self-hosted agents',
      text: 'Run Hermes Agent on a Raspberry Pi, previously experimented with OpenClaw and built a personal agent that connects the services I use.',
    },
    {
      name: 'agentic-fbd',
      href: 'https://afbd.gabocodes.com/',
      text: 'An open-source Claude Code skill that turns agent plans into interactive function block diagrams. Typed connections and validation help surface logic and state inconsistencies.',
      links: [
        { label: 'Source', href: 'https://github.com/gabolondon/agentic-fbd' },
        { label: 'Write-up', href: '/writing/agentic-fbd/' },
      ],
    },
    {
      name: 'Agent upgrade benchmark',
      href: '/writing/agent-upgrade-journey/',
      text: 'An anonymized account of how I evaluated and upgraded a production agent, with results for answer accuracy and latency.',
    },
    {
      name: 'Document extraction',
      href: '/writing/document-extraction-lanes/',
      text: 'Benchmarks on extracting data from unstructured PDFs with local and cloud models, redacting before cloud processing and using LLM judges to evaluate extracted fields.',
      links: [{ label: 'Evaluation write-up', href: '/writing/document-extraction-judge/' }],
    },
  ] as Project[],
  skills: [
    { name: 'LLM engineering', items: ['Google ADK', 'LangGraph', 'Hermes', 'MCP', 'Evaluation and LLM-as-judge', 'Caching and latency', 'Streaming', 'Prompt and tool design', 'OpenRouter', 'Local models (Ollama)'] },
    { name: 'Retrieval', items: ['RAG', 'Vertex AI', 'Milvus', 'Hybrid search (BM25 and embeddings)', 'Reranking', 'Source citations', 'Incremental indexing'] },
    { name: 'Inference and security', items: ['LiteLLM', 'GPU model serving', 'Speech recognition and synthesis', 'WireGuard', 'Role-based access'] },
    { name: 'AI coding tools', items: ['Claude Code', 'OpenCode', 'Gemini CLI', 'Antigravity', 'ChatGPT'] },
    { name: 'Backend', items: ['Python', 'FastAPI', 'Django REST', 'PostgreSQL', 'MySQL', 'Cloud SQL', 'Amazon Aurora'] },
    { name: 'Infrastructure', items: ['Docker / Compose', 'nginx', 'Google Cloud (Compute Engine, Cloud Run)', 'AWS', 'Cloudflare (Pages, Access, Tunnels)', 'CI pipelines'] },
    { name: 'Frontend and mobile', items: ['TypeScript', 'React', 'React Native', 'Angular', 'Astro'] },
    { name: 'Electronics', items: ['PLC, SCADA, HMI', 'STM32', 'Arduino', 'Raspberry Pi'] },
    { name: 'Languages', items: ['Spanish (native)', 'English (C1, self-assessed and used daily at Omniscope)'] },
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
