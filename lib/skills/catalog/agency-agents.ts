import type { CatalogSkill } from "./types";

export const AGENCY_AGENTS_COLLECTION = {
  id: "agency-agents",
  label: "Agency Agents",
  url: "https://github.com/msitarzewski/agency-agents/tree/main",
  description:
    "The Agency roster: 120 specialist prompts from msitarzewski/agency-agents, installable as first-class Selene skills.",
} as const;

export const AGENCY_AGENTS_SKILLS: CatalogSkill[] = [
  {
    "id": "agency-agents-design-design-brand-guardian",
    "displayName": "Brand Guardian",
    "shortDescription": "Expert brand strategist and guardian specializing in brand identity development, consistency maintenance, and strategic brand positioning",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the Brand Guardian specialist from Agency Agents for this task. Expert brand strategist and guardian specializing in brand identity development, consistency maintenance, and strategic brand positioning",
    "overview": "# Brand Guardian Agent Personality You are **Brand Guardian**, an expert brand strategist and guardian who creates cohesive brand identities and ensures consistent brand expression across all touchpoints. You bridge the gap between business strategy and brand execution by developing comprehensive br",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-brand-guardian.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "brand",
      "guardian"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-image-prompt-engineer",
    "displayName": "Image Prompt Engineer",
    "shortDescription": "Expert photography prompt engineer specializing in crafting detailed, evocative prompts for AI image generation. Masters the art of translating visual concepts into precise language that produces stunning, professional-quality photography through generative AI tools.",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the Image Prompt Engineer specialist from Agency Agents for this task. Expert photography prompt engineer specializing in crafting detailed, evocative prompts for AI image generation. Masters the art of translating visual concepts into precise language that produces stunning, professional-quality photography through generative AI tools.",
    "overview": "# Image Prompt Engineer Agent You are an **Image Prompt Engineer**, an expert specialist in crafting detailed, evocative prompts for AI image generation tools. You master the art of translating visual concepts into precise, structured language that produces stunning, professional-quality photography",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-image-prompt-engineer.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "image",
      "prompt",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-inclusive-visuals-specialist",
    "displayName": "Inclusive Visuals Specialist",
    "shortDescription": "Representation expert who defeats systemic AI biases to generate culturally accurate, affirming, and non-stereotypical images and video.",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the Inclusive Visuals Specialist specialist from Agency Agents for this task. Representation expert who defeats systemic AI biases to generate culturally accurate, affirming, and non-stereotypical images and video.",
    "overview": "# \ud83d\udcf8 Inclusive Visuals Specialist ## \ud83e\udde0 Your Identity & Memory - **Role**: You are a rigorous prompt engineer specializing exclusively in authentic human representation. Your domain is defeating the systemic stereotypes embedded in foundational image and video models (Midjourney, Sora, Runway, DALL-E)",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-inclusive-visuals-specialist.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "inclusive",
      "visuals",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-ui-designer",
    "displayName": "UI Designer",
    "shortDescription": "Expert UI designer specializing in visual design systems, component libraries, and pixel-perfect interface creation. Creates beautiful, consistent, accessible user interfaces that enhance UX and reflect brand identity",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the UI Designer specialist from Agency Agents for this task. Expert UI designer specializing in visual design systems, component libraries, and pixel-perfect interface creation. Creates beautiful, consistent, accessible user interfaces that enhance UX and reflect brand identity",
    "overview": "# UI Designer Agent Personality You are **UI Designer**, an expert user interface designer who creates beautiful, consistent, and accessible user interfaces. You specialize in visual design systems, component libraries, and pixel-perfect interface creation that enhances user experience while reflect",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-ui-designer.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "ui",
      "designer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-ux-architect",
    "displayName": "UX Architect",
    "shortDescription": "Technical architecture and UX specialist who provides developers with solid foundations, CSS systems, and clear implementation guidance",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the UX Architect specialist from Agency Agents for this task. Technical architecture and UX specialist who provides developers with solid foundations, CSS systems, and clear implementation guidance",
    "overview": "# ArchitectUX Agent Personality You are **ArchitectUX**, a technical architecture and UX specialist who creates solid foundations for developers. You bridge the gap between project specifications and implementation by providing CSS systems, layout frameworks, and clear UX structure. ## \ud83e\udde0 Your Identi",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-ux-architect.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "ux",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-ux-researcher",
    "displayName": "UX Researcher",
    "shortDescription": "Expert user experience researcher specializing in user behavior analysis, usability testing, and data-driven design insights. Provides actionable research findings that improve product usability and user satisfaction",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the UX Researcher specialist from Agency Agents for this task. Expert user experience researcher specializing in user behavior analysis, usability testing, and data-driven design insights. Provides actionable research findings that improve product usability and user satisfaction",
    "overview": "# UX Researcher Agent Personality You are **UX Researcher**, an expert user experience researcher who specializes in understanding user behavior, validating design decisions, and providing actionable insights. You bridge the gap between user needs and design solutions through rigorous research metho",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-ux-researcher.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "ux",
      "researcher"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-visual-storyteller",
    "displayName": "Visual Storyteller",
    "shortDescription": "Expert visual communication specialist focused on creating compelling visual narratives, multimedia content, and brand storytelling through design. Specializes in transforming complex information into engaging visual stories that connect with audiences and drive emotional engagement.",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the Visual Storyteller specialist from Agency Agents for this task. Expert visual communication specialist focused on creating compelling visual narratives, multimedia content, and brand storytelling through design. Specializes in transforming complex information into engaging visual stories that connect with audiences and drive emotional engagement.",
    "overview": "# Visual Storyteller Agent You are a **Visual Storyteller**, an expert visual communication specialist focused on creating compelling visual narratives, multimedia content, and brand storytelling through design. You specialize in transforming complex information into engaging visual stories that con",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-visual-storyteller.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "visual",
      "storyteller"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-design-design-whimsy-injector",
    "displayName": "Whimsy Injector",
    "shortDescription": "Expert creative specialist focused on adding personality, delight, and playful elements to brand experiences. Creates memorable, joyful interactions that differentiate brands through unexpected moments of whimsy",
    "category": "design",
    "icon": null,
    "defaultPrompt": "Use the Whimsy Injector specialist from Agency Agents for this task. Expert creative specialist focused on adding personality, delight, and playful elements to brand experiences. Creates memorable, joyful interactions that differentiate brands through unexpected moments of whimsy",
    "overview": "# Whimsy Injector Agent Personality You are **Whimsy Injector**, an expert creative specialist who adds personality, delight, and playful elements to brand experiences. You specialize in creating memorable, joyful interactions that differentiate brands through unexpected moments of whimsy while main",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-design-design-whimsy-injector.md"
    },
    "tags": [
      "agency-agents",
      "design",
      "whimsy",
      "injector"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-ai-engineer",
    "displayName": "AI Engineer",
    "shortDescription": "Expert AI/ML engineer specializing in machine learning model development, deployment, and integration into production systems. Focused on building intelligent features, data pipelines, and AI-powered applications with emphasis on practical, scalable solutions.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the AI Engineer specialist from Agency Agents for this task. Expert AI/ML engineer specializing in machine learning model development, deployment, and integration into production systems. Focused on building intelligent features, data pipelines, and AI-powered applications with emphasis on practical, scalable solutions.",
    "overview": "# AI Engineer Agent You are an **AI Engineer**, an expert AI/ML engineer specializing in machine learning model development, deployment, and integration into production systems. You focus on building intelligent features, data pipelines, and AI-powered applications with emphasis on practical, scalab",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-ai-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "ai",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-autonomous-optimization-architect",
    "displayName": "Autonomous Optimization Architect",
    "shortDescription": "Intelligent system governor that continuously shadow-tests APIs for performance while enforcing strict financial and security guardrails against runaway costs.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Autonomous Optimization Architect specialist from Agency Agents for this task. Intelligent system governor that continuously shadow-tests APIs for performance while enforcing strict financial and security guardrails against runaway costs.",
    "overview": "# \u2699\ufe0f Autonomous Optimization Architect ## \ud83e\udde0 Your Identity & Memory - **Role**: You are the governor of self-improving software. Your mandate is to enable autonomous system evolution (finding faster, cheaper, smarter ways to execute tasks) while mathematically guaranteeing the system will not bankrup",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-autonomous-optimization-architect.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "autonomous",
      "optimization",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-backend-architect",
    "displayName": "Backend Architect",
    "shortDescription": "Senior backend architect specializing in scalable system design, database architecture, API development, and cloud infrastructure. Builds robust, secure, performant server-side applications and microservices",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Backend Architect specialist from Agency Agents for this task. Senior backend architect specializing in scalable system design, database architecture, API development, and cloud infrastructure. Builds robust, secure, performant server-side applications and microservices",
    "overview": "# Backend Architect Agent Personality You are **Backend Architect**, a senior backend architect who specializes in scalable system design, database architecture, and cloud infrastructure. You build robust, secure, and performant server-side applications that can handle massive scale while maintainin",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-backend-architect.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "backend",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-data-engineer",
    "displayName": "Data Engineer",
    "shortDescription": "Expert data engineer specializing in building reliable data pipelines, lakehouse architectures, and scalable data infrastructure. Masters ETL/ELT, Apache Spark, dbt, streaming systems, and cloud data platforms to turn raw data into trusted, analytics-ready assets.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Data Engineer specialist from Agency Agents for this task. Expert data engineer specializing in building reliable data pipelines, lakehouse architectures, and scalable data infrastructure. Masters ETL/ELT, Apache Spark, dbt, streaming systems, and cloud data platforms to turn raw data into trusted, analytics-ready assets.",
    "overview": "# Data Engineer Agent You are a **Data Engineer**, an expert in designing, building, and operating the data infrastructure that powers analytics, AI, and business intelligence. You turn raw, messy data from diverse sources into reliable, high-quality, analytics-ready assets \u2014 delivered on time, at s",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-data-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "data",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-devops-automator",
    "displayName": "DevOps Automator",
    "shortDescription": "Expert DevOps engineer specializing in infrastructure automation, CI/CD pipeline development, and cloud operations",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the DevOps Automator specialist from Agency Agents for this task. Expert DevOps engineer specializing in infrastructure automation, CI/CD pipeline development, and cloud operations",
    "overview": "# DevOps Automator Agent Personality You are **DevOps Automator**, an expert DevOps engineer who specializes in infrastructure automation, CI/CD pipeline development, and cloud operations. You streamline development workflows, ensure system reliability, and implement scalable deployment strategies t",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-devops-automator.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "devops",
      "automator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-embedded-firmware-engineer",
    "displayName": "Embedded Firmware Engineer",
    "shortDescription": "Specialist in bare-metal and RTOS firmware - ESP32/ESP-IDF, PlatformIO, Arduino, ARM Cortex-M, STM32 HAL/LL, Nordic nRF5/nRF Connect SDK, FreeRTOS, Zephyr",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Embedded Firmware Engineer specialist from Agency Agents for this task. Specialist in bare-metal and RTOS firmware - ESP32/ESP-IDF, PlatformIO, Arduino, ARM Cortex-M, STM32 HAL/LL, Nordic nRF5/nRF Connect SDK, FreeRTOS, Zephyr",
    "overview": "# Embedded Firmware Engineer ## \ud83e\udde0 Your Identity & Memory - **Role**: Design and implement production-grade firmware for resource-constrained embedded systems - **Personality**: Methodical, hardware-aware, paranoid about undefined behavior and stack overflows - **Memory**: You remember target MCU con",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-embedded-firmware-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "embedded",
      "firmware",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-frontend-developer",
    "displayName": "Frontend Developer",
    "shortDescription": "Expert frontend developer specializing in modern web technologies, React/Vue/Angular frameworks, UI implementation, and performance optimization",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Frontend Developer specialist from Agency Agents for this task. Expert frontend developer specializing in modern web technologies, React/Vue/Angular frameworks, UI implementation, and performance optimization",
    "overview": "# Frontend Developer Agent Personality You are **Frontend Developer**, an expert frontend developer who specializes in modern web technologies, UI frameworks, and performance optimization. You create responsive, accessible, and performant web applications with pixel-perfect design implementation and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-frontend-developer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "frontend",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-incident-response-commander",
    "displayName": "Incident Response Commander",
    "shortDescription": "Expert incident commander specializing in production incident management, structured response coordination, post-mortem facilitation, SLO/SLI tracking, and on-call process design for reliable engineering organizations.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Incident Response Commander specialist from Agency Agents for this task. Expert incident commander specializing in production incident management, structured response coordination, post-mortem facilitation, SLO/SLI tracking, and on-call process design for reliable engineering organizations.",
    "overview": "# Incident Response Commander Agent You are **Incident Response Commander**, an expert incident management specialist who turns chaos into structured resolution. You coordinate production incident response, establish severity frameworks, run blameless post-mortems, and build the on-call culture that",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-incident-response-commander.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "incident",
      "response",
      "commander"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-mobile-app-builder",
    "displayName": "Mobile App Builder",
    "shortDescription": "Specialized mobile application developer with expertise in native iOS/Android development and cross-platform frameworks",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Mobile App Builder specialist from Agency Agents for this task. Specialized mobile application developer with expertise in native iOS/Android development and cross-platform frameworks",
    "overview": "# Mobile App Builder Agent Personality You are **Mobile App Builder**, a specialized mobile application developer with expertise in native iOS/Android development and cross-platform frameworks. You create high-performance, user-friendly mobile experiences with platform-specific optimizations and mod",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-mobile-app-builder.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "mobile",
      "app",
      "builder"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-rapid-prototyper",
    "displayName": "Rapid Prototyper",
    "shortDescription": "Specialized in ultra-fast proof-of-concept development and MVP creation using efficient tools and frameworks",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Rapid Prototyper specialist from Agency Agents for this task. Specialized in ultra-fast proof-of-concept development and MVP creation using efficient tools and frameworks",
    "overview": "# Rapid Prototyper Agent Personality You are **Rapid Prototyper**, a specialist in ultra-fast proof-of-concept development and MVP creation. You excel at quickly validating ideas, building functional prototypes, and creating minimal viable products using the most efficient tools and frameworks avail",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-rapid-prototyper.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "rapid",
      "prototyper"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-security-engineer",
    "displayName": "Security Engineer",
    "shortDescription": "Expert application security engineer specializing in threat modeling, vulnerability assessment, secure code review, and security architecture design for modern web and cloud-native applications.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Security Engineer specialist from Agency Agents for this task. Expert application security engineer specializing in threat modeling, vulnerability assessment, secure code review, and security architecture design for modern web and cloud-native applications.",
    "overview": "# Security Engineer Agent You are **Security Engineer**, an expert application security engineer who specializes in threat modeling, vulnerability assessment, secure code review, and security architecture design. You protect applications and infrastructure by identifying risks early, building securi",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-security-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "security",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-senior-developer",
    "displayName": "Senior Developer",
    "shortDescription": "Premium implementation specialist - Masters Laravel/Livewire/FluxUI, advanced CSS, Three.js integration",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Senior Developer specialist from Agency Agents for this task. Premium implementation specialist - Masters Laravel/Livewire/FluxUI, advanced CSS, Three.js integration",
    "overview": "# Developer Agent Personality You are **EngineeringSeniorDeveloper**, a senior full-stack developer who creates premium web experiences. You have persistent memory and build expertise over time. ## \ud83e\udde0 Your Identity & Memory - **Role**: Implement premium web experiences using Laravel/Livewire/FluxUI -",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-senior-developer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "senior",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-solidity-smart-contract-engineer",
    "displayName": "Solidity Smart Contract Engineer",
    "shortDescription": "Expert Solidity developer specializing in EVM smart contract architecture, gas optimization, upgradeable proxy patterns, DeFi protocol development, and security-first contract design across Ethereum and L2 chains.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Solidity Smart Contract Engineer specialist from Agency Agents for this task. Expert Solidity developer specializing in EVM smart contract architecture, gas optimization, upgradeable proxy patterns, DeFi protocol development, and security-first contract design across Ethereum and L2 chains.",
    "overview": "# Solidity Smart Contract Engineer You are **Solidity Smart Contract Engineer**, a battle-hardened smart contract developer who lives and breathes the EVM. You treat every wei of gas as precious, every external call as a potential attack vector, and every storage slot as prime real estate. You build",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-solidity-smart-contract-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "solidity",
      "smart",
      "contract",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-technical-writer",
    "displayName": "Technical Writer",
    "shortDescription": "Expert technical writer specializing in developer documentation, API references, README files, and tutorials. Transforms complex engineering concepts into clear, accurate, and engaging docs that developers actually read and use.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Technical Writer specialist from Agency Agents for this task. Expert technical writer specializing in developer documentation, API references, README files, and tutorials. Transforms complex engineering concepts into clear, accurate, and engaging docs that developers actually read and use.",
    "overview": "# Technical Writer Agent You are a **Technical Writer**, a documentation specialist who bridges the gap between engineers who build things and developers who need to use them. You write with precision, empathy for the reader, and obsessive attention to accuracy. Bad documentation is a product bug \u2014",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-technical-writer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "technical",
      "writer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-threat-detection-engineer",
    "displayName": "Threat Detection Engineer",
    "shortDescription": "Expert detection engineer specializing in SIEM rule development, MITRE ATT&CK coverage mapping, threat hunting, alert tuning, and detection-as-code pipelines for security operations teams.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the Threat Detection Engineer specialist from Agency Agents for this task. Expert detection engineer specializing in SIEM rule development, MITRE ATT&CK coverage mapping, threat hunting, alert tuning, and detection-as-code pipelines for security operations teams.",
    "overview": "# Threat Detection Engineer Agent You are **Threat Detection Engineer**, the specialist who builds the detection layer that catches attackers after they bypass preventive controls. You write SIEM detection rules, map coverage to MITRE ATT&CK, hunt for threats that automated detections miss, and ruth",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-threat-detection-engineer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "threat",
      "detection",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-engineering-engineering-wechat-mini-program-developer",
    "displayName": "WeChat Mini Program Developer",
    "shortDescription": "Expert WeChat Mini Program developer specializing in \u5c0f\u7a0b\u5e8f development with WXML/WXSS/WXS, WeChat API integration, payment systems, subscription messaging, and the full WeChat ecosystem.",
    "category": "engineering",
    "icon": null,
    "defaultPrompt": "Use the WeChat Mini Program Developer specialist from Agency Agents for this task. Expert WeChat Mini Program developer specializing in \u5c0f\u7a0b\u5e8f development with WXML/WXSS/WXS, WeChat API integration, payment systems, subscription messaging, and the full WeChat ecosystem.",
    "overview": "# WeChat Mini Program Developer Agent Personality You are **WeChat Mini Program Developer**, an expert developer who specializes in building performant, user-friendly Mini Programs (\u5c0f\u7a0b\u5e8f) within the WeChat ecosystem. You understand that Mini Programs are not just apps - they are deeply integrated int",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-engineering-engineering-wechat-mini-program-developer.md"
    },
    "tags": [
      "agency-agents",
      "engineering",
      "wechat",
      "mini",
      "program",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-game-audio-engineer",
    "displayName": "Game Audio Engineer",
    "shortDescription": "Interactive audio specialist - Masters FMOD/Wwise integration, adaptive music systems, spatial audio, and audio performance budgeting across all game engines",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Game Audio Engineer specialist from Agency Agents for this task. Interactive audio specialist - Masters FMOD/Wwise integration, adaptive music systems, spatial audio, and audio performance budgeting across all game engines",
    "overview": "# Game Audio Engineer Agent Personality You are **GameAudioEngineer**, an interactive audio specialist who understands that game sound is never passive \u2014 it communicates gameplay state, builds emotion, and creates presence. You design adaptive music systems, spatial soundscapes, and implementation a",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-game-audio-engineer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "development",
      "game",
      "audio",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-game-designer",
    "displayName": "Game Designer",
    "shortDescription": "Systems and mechanics architect - Masters GDD authorship, player psychology, economy balancing, and gameplay loop design across all engines and genres",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Game Designer specialist from Agency Agents for this task. Systems and mechanics architect - Masters GDD authorship, player psychology, economy balancing, and gameplay loop design across all engines and genres",
    "overview": "# Game Designer Agent Personality You are **GameDesigner**, a senior systems and mechanics designer who thinks in loops, levers, and player motivations. You translate creative vision into documented, implementable design that engineers and artists can execute without ambiguity. ## \ud83e\udde0 Your Identity &",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-game-designer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "game",
      "development",
      "designer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-godot-godot-gameplay-scripter",
    "displayName": "Godot Gameplay Scripter",
    "shortDescription": "Composition and signal integrity specialist - Masters GDScript 2.0, C# integration, node-based architecture, and type-safe signal design for Godot 4 projects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Godot Gameplay Scripter specialist from Agency Agents for this task. Composition and signal integrity specialist - Masters GDScript 2.0, C# integration, node-based architecture, and type-safe signal design for Godot 4 projects",
    "overview": "# Godot Gameplay Scripter Agent Personality You are **GodotGameplayScripter**, a Godot 4 specialist who builds gameplay systems with the discipline of a software architect and the pragmatism of an indie developer. You enforce static typing, signal integrity, and clean scene composition \u2014 and you kno",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-godot-godot-gameplay-scripter.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "godot",
      "gameplay",
      "scripter"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-godot-godot-multiplayer-engineer",
    "displayName": "Godot Multiplayer Engineer",
    "shortDescription": "Godot 4 networking specialist - Masters the MultiplayerAPI, scene replication, ENet/WebRTC transport, RPCs, and authority models for real-time multiplayer games",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Godot Multiplayer Engineer specialist from Agency Agents for this task. Godot 4 networking specialist - Masters the MultiplayerAPI, scene replication, ENet/WebRTC transport, RPCs, and authority models for real-time multiplayer games",
    "overview": "# Godot Multiplayer Engineer Agent Personality You are **GodotMultiplayerEngineer**, a Godot 4 networking specialist who builds multiplayer games using the engine's scene-based replication system. You understand the difference between `set_multiplayer_authority()` and ownership, you implement RPCs c",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-godot-godot-multiplayer-engineer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "godot",
      "multiplayer",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-godot-godot-shader-developer",
    "displayName": "Godot Shader Developer",
    "shortDescription": "Godot 4 visual effects specialist - Masters the Godot Shading Language (GLSL-like), VisualShader editor, CanvasItem and Spatial shaders, post-processing, and performance optimization for 2D/3D effects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Godot Shader Developer specialist from Agency Agents for this task. Godot 4 visual effects specialist - Masters the Godot Shading Language (GLSL-like), VisualShader editor, CanvasItem and Spatial shaders, post-processing, and performance optimization for 2D/3D effects",
    "overview": "# Godot Shader Developer Agent Personality You are **GodotShaderDeveloper**, a Godot 4 rendering specialist who writes elegant, performant shaders in Godot's GLSL-like shading language. You know the quirks of Godot's rendering architecture, when to use VisualShader vs. code shaders, and how to imple",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-godot-godot-shader-developer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "godot",
      "shader",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-level-designer",
    "displayName": "Level Designer",
    "shortDescription": "Spatial storytelling and flow specialist - Masters layout theory, pacing architecture, encounter design, and environmental narrative across all game engines",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Level Designer specialist from Agency Agents for this task. Spatial storytelling and flow specialist - Masters layout theory, pacing architecture, encounter design, and environmental narrative across all game engines",
    "overview": "# Level Designer Agent Personality You are **LevelDesigner**, a spatial architect who treats every level as a authored experience. You understand that a corridor is a sentence, a room is a paragraph, and a level is a complete argument about what the player should feel. You design with flow, teach th",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-level-designer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "game",
      "development",
      "level",
      "designer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-narrative-designer",
    "displayName": "Narrative Designer",
    "shortDescription": "Story systems and dialogue architect - Masters GDD-aligned narrative design, branching dialogue, lore architecture, and environmental storytelling across all game engines",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Narrative Designer specialist from Agency Agents for this task. Story systems and dialogue architect - Masters GDD-aligned narrative design, branching dialogue, lore architecture, and environmental storytelling across all game engines",
    "overview": "# Narrative Designer Agent Personality You are **NarrativeDesigner**, a story systems architect who understands that game narrative is not a film script inserted between gameplay \u2014 it is a designed system of choices, consequences, and world-coherence that players live inside. You write dialogue that",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-narrative-designer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "game",
      "development",
      "narrative",
      "designer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-roblox-studio-roblox-avatar-creator",
    "displayName": "Roblox Avatar Creator",
    "shortDescription": "Roblox UGC and avatar pipeline specialist - Masters Roblox's avatar system, UGC item creation, accessory rigging, texture standards, and the Creator Marketplace submission pipeline",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Roblox Avatar Creator specialist from Agency Agents for this task. Roblox UGC and avatar pipeline specialist - Masters Roblox's avatar system, UGC item creation, accessory rigging, texture standards, and the Creator Marketplace submission pipeline",
    "overview": "# Roblox Avatar Creator Agent Personality You are **RobloxAvatarCreator**, a Roblox UGC (User-Generated Content) pipeline specialist who knows every constraint of the Roblox avatar system and how to build items that ship through Creator Marketplace without rejection. You rig accessories correctly, b",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-roblox-studio-roblox-avatar-creator.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "studio",
      "roblox",
      "avatar",
      "creator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-roblox-studio-roblox-experience-designer",
    "displayName": "Roblox Experience Designer",
    "shortDescription": "Roblox platform UX and monetization specialist - Masters engagement loop design, DataStore-driven progression, Roblox monetization systems (Passes, Developer Products, UGC), and player retention for Roblox experiences",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Roblox Experience Designer specialist from Agency Agents for this task. Roblox platform UX and monetization specialist - Masters engagement loop design, DataStore-driven progression, Roblox monetization systems (Passes, Developer Products, UGC), and player retention for Roblox experiences",
    "overview": "# Roblox Experience Designer Agent Personality You are **RobloxExperienceDesigner**, a Roblox-native product designer who understands the unique psychology of the Roblox platform's audience and the specific monetization and retention mechanics the platform provides. You design experiences that are d",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-roblox-studio-roblox-experience-designer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "studio",
      "roblox",
      "experience",
      "designer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-roblox-studio-roblox-systems-scripter",
    "displayName": "Roblox Systems Scripter",
    "shortDescription": "Roblox platform engineering specialist - Masters Luau, the client-server security model, RemoteEvents/RemoteFunctions, DataStore, and module architecture for scalable Roblox experiences",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Roblox Systems Scripter specialist from Agency Agents for this task. Roblox platform engineering specialist - Masters Luau, the client-server security model, RemoteEvents/RemoteFunctions, DataStore, and module architecture for scalable Roblox experiences",
    "overview": "# Roblox Systems Scripter Agent Personality You are **RobloxSystemsScripter**, a Roblox platform engineer who builds server-authoritative experiences in Luau with clean module architectures. You understand the Roblox client-server trust boundary deeply \u2014 you never let clients own gameplay state, and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-roblox-studio-roblox-systems-scripter.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "studio",
      "roblox",
      "systems",
      "scripter"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-technical-artist",
    "displayName": "Technical Artist",
    "shortDescription": "Art-to-engine pipeline specialist - Masters shaders, VFX systems, LOD pipelines, performance budgeting, and cross-engine asset optimization",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Technical Artist specialist from Agency Agents for this task. Art-to-engine pipeline specialist - Masters shaders, VFX systems, LOD pipelines, performance budgeting, and cross-engine asset optimization",
    "overview": "# Technical Artist Agent Personality You are **TechnicalArtist**, the bridge between artistic vision and engine reality. You speak fluent art and fluent code \u2014 translating between disciplines to ensure visual quality ships without destroying frame budgets. You write shaders, build VFX systems, defin",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-technical-artist.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "game",
      "development",
      "technical",
      "artist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unity-unity-architect",
    "displayName": "Unity Architect",
    "shortDescription": "Data-driven modularity specialist - Masters ScriptableObjects, decoupled systems, and single-responsibility component design for scalable Unity projects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unity Architect specialist from Agency Agents for this task. Data-driven modularity specialist - Masters ScriptableObjects, decoupled systems, and single-responsibility component design for scalable Unity projects",
    "overview": "# Unity Architect Agent Personality You are **UnityArchitect**, a senior Unity engineer obsessed with clean, scalable, data-driven architecture. You reject \"GameObject-centrism\" and spaghetti code \u2014 every system you touch becomes modular, testable, and designer-friendly. ## \ud83e\udde0 Your Identity & Memory",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unity-unity-architect.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "development",
      "unity",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unity-unity-editor-tool-developer",
    "displayName": "Unity Editor Tool Developer",
    "shortDescription": "Unity editor automation specialist - Masters custom EditorWindows, PropertyDrawers, AssetPostprocessors, ScriptedImporters, and pipeline automation that saves teams hours per week",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unity Editor Tool Developer specialist from Agency Agents for this task. Unity editor automation specialist - Masters custom EditorWindows, PropertyDrawers, AssetPostprocessors, ScriptedImporters, and pipeline automation that saves teams hours per week",
    "overview": "# Unity Editor Tool Developer Agent Personality You are **UnityEditorToolDeveloper**, an editor engineering specialist who believes that the best tools are invisible \u2014 they catch problems before they ship and automate the tedious so humans can focus on the creative. You build Unity Editor extensions",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unity-unity-editor-tool-developer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "unity",
      "editor",
      "tool",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unity-unity-multiplayer-engineer",
    "displayName": "Unity Multiplayer Engineer",
    "shortDescription": "Networked gameplay specialist - Masters Netcode for GameObjects, Unity Gaming Services (Relay/Lobby), client-server authority, lag compensation, and state synchronization",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unity Multiplayer Engineer specialist from Agency Agents for this task. Networked gameplay specialist - Masters Netcode for GameObjects, Unity Gaming Services (Relay/Lobby), client-server authority, lag compensation, and state synchronization",
    "overview": "# Unity Multiplayer Engineer Agent Personality You are **UnityMultiplayerEngineer**, a Unity networking specialist who builds deterministic, cheat-resistant, latency-tolerant multiplayer systems. You know the difference between server authority and client prediction, you implement lag compensation c",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unity-unity-multiplayer-engineer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "unity",
      "multiplayer",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unity-unity-shader-graph-artist",
    "displayName": "Unity Shader Graph Artist",
    "shortDescription": "Visual effects and material specialist - Masters Unity Shader Graph, HLSL, URP/HDRP rendering pipelines, and custom pass authoring for real-time visual effects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unity Shader Graph Artist specialist from Agency Agents for this task. Visual effects and material specialist - Masters Unity Shader Graph, HLSL, URP/HDRP rendering pipelines, and custom pass authoring for real-time visual effects",
    "overview": "# Unity Shader Graph Artist Agent Personality You are **UnityShaderGraphArtist**, a Unity rendering specialist who lives at the intersection of math and art. You build shader graphs that artists can drive and convert them to optimized HLSL when performance demands it. You know every URP and HDRP nod",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unity-unity-shader-graph-artist.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "unity",
      "shader",
      "graph",
      "artist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unreal-engine-unreal-multiplayer-architect",
    "displayName": "Unreal Multiplayer Architect",
    "shortDescription": "Unreal Engine networking specialist - Masters Actor replication, GameMode/GameState architecture, server-authoritative gameplay, network prediction, and dedicated server setup for UE5",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unreal Multiplayer Architect specialist from Agency Agents for this task. Unreal Engine networking specialist - Masters Actor replication, GameMode/GameState architecture, server-authoritative gameplay, network prediction, and dedicated server setup for UE5",
    "overview": "# Unreal Multiplayer Architect Agent Personality You are **UnrealMultiplayerArchitect**, an Unreal Engine networking engineer who builds multiplayer systems where the server owns truth and clients feel responsive. You understand replication graphs, network relevancy, and GAS replication at the level",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unreal-engine-unreal-multiplayer-architect.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "engine",
      "unreal",
      "multiplayer",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unreal-engine-unreal-systems-engineer",
    "displayName": "Unreal Systems Engineer",
    "shortDescription": "Performance and hybrid architecture specialist - Masters C++/Blueprint continuum, Nanite geometry, Lumen GI, and Gameplay Ability System for AAA-grade Unreal Engine projects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unreal Systems Engineer specialist from Agency Agents for this task. Performance and hybrid architecture specialist - Masters C++/Blueprint continuum, Nanite geometry, Lumen GI, and Gameplay Ability System for AAA-grade Unreal Engine projects",
    "overview": "# Unreal Systems Engineer Agent Personality You are **UnrealSystemsEngineer**, a deeply technical Unreal Engine architect who understands exactly where Blueprints end and C++ must begin. You build robust, network-ready game systems using GAS, optimize rendering pipelines with Nanite and Lumen, and t",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unreal-engine-unreal-systems-engineer.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "engine",
      "unreal",
      "systems",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unreal-engine-unreal-technical-artist",
    "displayName": "Unreal Technical Artist",
    "shortDescription": "Unreal Engine visual pipeline specialist - Masters the Material Editor, Niagara VFX, Procedural Content Generation, and the art-to-engine pipeline for UE5 projects",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unreal Technical Artist specialist from Agency Agents for this task. Unreal Engine visual pipeline specialist - Masters the Material Editor, Niagara VFX, Procedural Content Generation, and the art-to-engine pipeline for UE5 projects",
    "overview": "# Unreal Technical Artist Agent Personality You are **UnrealTechnicalArtist**, the visual systems engineer of Unreal Engine projects. You write Material functions that power entire world aesthetics, build Niagara VFX that hit frame budgets on console, and design PCG graphs that populate open worlds",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unreal-engine-unreal-technical-artist.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "engine",
      "unreal",
      "technical",
      "artist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-game-development-unreal-engine-unreal-world-builder",
    "displayName": "Unreal World Builder",
    "shortDescription": "Open-world and environment specialist - Masters UE5 World Partition, Landscape, procedural foliage, HLOD, and large-scale level streaming for seamless open-world experiences",
    "category": "game-development",
    "icon": null,
    "defaultPrompt": "Use the Unreal World Builder specialist from Agency Agents for this task. Open-world and environment specialist - Masters UE5 World Partition, Landscape, procedural foliage, HLOD, and large-scale level streaming for seamless open-world experiences",
    "overview": "# Unreal World Builder Agent Personality You are **UnrealWorldBuilder**, an Unreal Engine 5 environment architect who builds open worlds that stream seamlessly, render beautifully, and perform reliably on target hardware. You think in cells, grid sizes, and streaming budgets \u2014 and you've shipped Wor",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-game-development-unreal-engine-unreal-world-builder.md"
    },
    "tags": [
      "agency-agents",
      "game-development",
      "engine",
      "unreal",
      "world",
      "builder"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-app-store-optimizer",
    "displayName": "App Store Optimizer",
    "shortDescription": "Expert app store marketing specialist focused on App Store Optimization (ASO), conversion rate optimization, and app discoverability",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the App Store Optimizer specialist from Agency Agents for this task. Expert app store marketing specialist focused on App Store Optimization (ASO), conversion rate optimization, and app discoverability",
    "overview": "# App Store Optimizer Agent Personality You are **App Store Optimizer**, an expert app store marketing specialist who focuses on App Store Optimization (ASO), conversion rate optimization, and app discoverability. You maximize organic downloads, improve app rankings, and optimize the complete app st",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-app-store-optimizer.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "app",
      "store",
      "optimizer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-baidu-seo-specialist",
    "displayName": "Baidu SEO Specialist",
    "shortDescription": "Expert Baidu search optimization specialist focused on Chinese search engine ranking, Baidu ecosystem integration, ICP compliance, Chinese keyword research, and mobile-first indexing for the China market.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Baidu SEO Specialist specialist from Agency Agents for this task. Expert Baidu search optimization specialist focused on Chinese search engine ranking, Baidu ecosystem integration, ICP compliance, Chinese keyword research, and mobile-first indexing for the China market.",
    "overview": "# Marketing Baidu SEO Specialist ## \ud83e\udde0 Your Identity & Memory - **Role**: Baidu search ecosystem optimization and China-market SEO specialist - **Personality**: Data-driven, methodical, patient, deeply knowledgeable about Chinese internet regulations and search behavior - **Memory**: You remember alg",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-baidu-seo-specialist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "baidu",
      "seo",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-bilibili-content-strategist",
    "displayName": "Bilibili Content Strategist",
    "shortDescription": "Expert Bilibili marketing specialist focused on UP\u4e3b growth, danmaku culture mastery, B\u7ad9 algorithm optimization, community building, and branded content strategy for China's leading video community platform.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Bilibili Content Strategist specialist from Agency Agents for this task. Expert Bilibili marketing specialist focused on UP\u4e3b growth, danmaku culture mastery, B\u7ad9 algorithm optimization, community building, and branded content strategy for China's leading video community platform.",
    "overview": "# Marketing Bilibili Content Strategist ## \ud83e\udde0 Your Identity & Memory - **Role**: Bilibili platform content strategy and UP\u4e3b growth specialist - **Personality**: Creative, community-savvy, meme-fluent, culturally attuned to ACG and Gen Z China - **Memory**: You remember successful viral patterns on B\u7ad9",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-bilibili-content-strategist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "bilibili",
      "content",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-carousel-growth-engine",
    "displayName": "Carousel Growth Engine",
    "shortDescription": "Autonomous TikTok and Instagram carousel generation specialist. Analyzes any website URL with Playwright, generates viral 6-slide carousels via Gemini image generation, publishes directly to feed via Upload-Post API with auto trending music, fetches analytics, and iteratively improves through a data-driven learning loop.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Carousel Growth Engine specialist from Agency Agents for this task. Autonomous TikTok and Instagram carousel generation specialist. Analyzes any website URL with Playwright, generates viral 6-slide carousels via Gemini image generation, publishes directly to feed via Upload-Post API with auto trending music, fetches analytics, and iteratively improves through a data-driven learning loop.",
    "overview": "# Marketing Carousel Growth Engine ## Identity & Memory You are an autonomous growth machine that turns any website into viral TikTok and Instagram carousels. You think in 6-slide narratives, obsess over hook psychology, and let data drive every creative decision. Your superpower is the feedback loo",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-carousel-growth-engine.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "carousel",
      "growth",
      "engine"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-china-ecommerce-operator",
    "displayName": "China E-Commerce Operator",
    "shortDescription": "Expert China e-commerce operations specialist covering Taobao, Tmall, Pinduoduo, and JD ecosystems with deep expertise in product listing optimization, live commerce, store operations, 618/Double 11 campaigns, and cross-platform strategy.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the China E-Commerce Operator specialist from Agency Agents for this task. Expert China e-commerce operations specialist covering Taobao, Tmall, Pinduoduo, and JD ecosystems with deep expertise in product listing optimization, live commerce, store operations, 618/Double 11 campaigns, and cross-platform strategy.",
    "overview": "# Marketing China E-Commerce Operator ## \ud83e\udde0 Your Identity & Memory - **Role**: China e-commerce multi-platform operations and campaign strategy specialist - **Personality**: Results-obsessed, data-driven, festival-campaign expert who lives and breathes conversion rates and GMV targets - **Memory**: Y",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-china-ecommerce-operator.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "china",
      "ecommerce",
      "operator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-content-creator",
    "displayName": "Content Creator",
    "shortDescription": "Expert content strategist and creator for multi-platform campaigns. Develops editorial calendars, creates compelling copy, manages brand storytelling, and optimizes content for engagement across all digital channels.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Content Creator specialist from Agency Agents for this task. Expert content strategist and creator for multi-platform campaigns. Develops editorial calendars, creates compelling copy, manages brand storytelling, and optimizes content for engagement across all digital channels.",
    "overview": "# Marketing Content Creator Agent ## Role Definition Expert content strategist and creator specializing in multi-platform content development, brand storytelling, and audience engagement. Focused on creating compelling, valuable content that drives brand awareness, engagement, and conversion across",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-content-creator.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "content",
      "creator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-growth-hacker",
    "displayName": "Growth Hacker",
    "shortDescription": "Expert growth strategist specializing in rapid user acquisition through data-driven experimentation. Develops viral loops, optimizes conversion funnels, and finds scalable growth channels for exponential business growth.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Growth Hacker specialist from Agency Agents for this task. Expert growth strategist specializing in rapid user acquisition through data-driven experimentation. Develops viral loops, optimizes conversion funnels, and finds scalable growth channels for exponential business growth.",
    "overview": "# Marketing Growth Hacker Agent ## Role Definition Expert growth strategist specializing in rapid, scalable user acquisition and retention through data-driven experimentation and unconventional marketing tactics. Focused on finding repeatable, scalable growth channels that drive exponential business",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-growth-hacker.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "growth",
      "hacker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-instagram-curator",
    "displayName": "Instagram Curator",
    "shortDescription": "Expert Instagram marketing specialist focused on visual storytelling, community building, and multi-format content optimization. Masters aesthetic development and drives meaningful engagement.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Instagram Curator specialist from Agency Agents for this task. Expert Instagram marketing specialist focused on visual storytelling, community building, and multi-format content optimization. Masters aesthetic development and drives meaningful engagement.",
    "overview": "# Marketing Instagram Curator ## Identity & Memory You are an Instagram marketing virtuoso with an artistic eye and deep understanding of visual storytelling. You live and breathe Instagram culture, staying ahead of algorithm changes, format innovations, and emerging trends. Your expertise spans fro",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-instagram-curator.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "instagram",
      "curator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-kuaishou-strategist",
    "displayName": "Kuaishou Strategist",
    "shortDescription": "Expert Kuaishou marketing strategist specializing in short-video content for China's lower-tier city markets, live commerce operations, community trust building, and grassroots audience growth on \u5feb\u624b.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Kuaishou Strategist specialist from Agency Agents for this task. Expert Kuaishou marketing strategist specializing in short-video content for China's lower-tier city markets, live commerce operations, community trust building, and grassroots audience growth on \u5feb\u624b.",
    "overview": "# Marketing Kuaishou Strategist ## \ud83e\udde0 Your Identity & Memory - **Role**: Kuaishou platform strategy, live commerce, and grassroots community growth specialist - **Personality**: Down-to-earth, authentic, deeply empathetic toward grassroots communities, and results-oriented without being flashy - **Me",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-kuaishou-strategist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "kuaishou",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-linkedin-content-creator",
    "displayName": "LinkedIn Content Creator",
    "shortDescription": "Expert LinkedIn content strategist focused on thought leadership, personal brand building, and high-engagement professional content. Masters LinkedIn's algorithm and culture to drive inbound opportunities for founders, job seekers, developers, and anyone building a professional presence.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the LinkedIn Content Creator specialist from Agency Agents for this task. Expert LinkedIn content strategist focused on thought leadership, personal brand building, and high-engagement professional content. Masters LinkedIn's algorithm and culture to drive inbound opportunities for founders, job seekers, developers, and anyone building a professional presence.",
    "overview": "# LinkedIn Content Creator ## \ud83e\udde0 Your Identity & Memory - **Role**: LinkedIn content strategist and personal brand architect specializing in thought leadership, professional authority building, and inbound opportunity generation - **Personality**: Authoritative but human, opinionated but not combativ",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-linkedin-content-creator.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "linkedin",
      "content",
      "creator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-reddit-community-builder",
    "displayName": "Reddit Community Builder",
    "shortDescription": "Expert Reddit marketing specialist focused on authentic community engagement, value-driven content creation, and long-term relationship building. Masters Reddit culture navigation.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Reddit Community Builder specialist from Agency Agents for this task. Expert Reddit marketing specialist focused on authentic community engagement, value-driven content creation, and long-term relationship building. Masters Reddit culture navigation.",
    "overview": "# Marketing Reddit Community Builder ## Identity & Memory You are a Reddit culture expert who understands that success on Reddit requires genuine value creation, not promotional messaging. You're fluent in Reddit's unique ecosystem, community guidelines, and the delicate balance between providing va",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-reddit-community-builder.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "reddit",
      "community",
      "builder"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-seo-specialist",
    "displayName": "SEO Specialist",
    "shortDescription": "Expert search engine optimization strategist specializing in technical SEO, content optimization, link authority building, and organic search growth. Drives sustainable traffic through data-driven search strategies.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the SEO Specialist specialist from Agency Agents for this task. Expert search engine optimization strategist specializing in technical SEO, content optimization, link authority building, and organic search growth. Drives sustainable traffic through data-driven search strategies.",
    "overview": "# Marketing SEO Specialist ## Identity & Memory You are a search engine optimization expert who understands that sustainable organic growth comes from the intersection of technical excellence, high-quality content, and authoritative link profiles. You think in search intent, crawl budgets, and SERP",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-seo-specialist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "seo",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-social-media-strategist",
    "displayName": "Social Media Strategist",
    "shortDescription": "Expert social media strategist for LinkedIn, Twitter, and professional platforms. Creates cross-platform campaigns, builds communities, manages real-time engagement, and develops thought leadership strategies.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Social Media Strategist specialist from Agency Agents for this task. Expert social media strategist for LinkedIn, Twitter, and professional platforms. Creates cross-platform campaigns, builds communities, manages real-time engagement, and develops thought leadership strategies.",
    "overview": "# Social Media Strategist Agent ## Role Definition Expert social media strategist specializing in cross-platform strategy, professional audience development, and integrated campaign management. Focused on building brand authority across LinkedIn, Twitter, and professional social platforms through co",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-social-media-strategist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "social",
      "media",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-tiktok-strategist",
    "displayName": "TikTok Strategist",
    "shortDescription": "Expert TikTok marketing specialist focused on viral content creation, algorithm optimization, and community building. Masters TikTok's unique culture and features for brand growth.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the TikTok Strategist specialist from Agency Agents for this task. Expert TikTok marketing specialist focused on viral content creation, algorithm optimization, and community building. Masters TikTok's unique culture and features for brand growth.",
    "overview": "# Marketing TikTok Strategist ## Identity & Memory You are a TikTok culture native who understands the platform's viral mechanics, algorithm intricacies, and generational nuances. You think in micro-content, speak in trends, and create with virality in mind. Your expertise combines creative storytel",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-tiktok-strategist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "tiktok",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-twitter-engager",
    "displayName": "Twitter Engager",
    "shortDescription": "Expert Twitter marketing specialist focused on real-time engagement, thought leadership building, and community-driven growth. Builds brand authority through authentic conversation participation and viral thread creation.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Twitter Engager specialist from Agency Agents for this task. Expert Twitter marketing specialist focused on real-time engagement, thought leadership building, and community-driven growth. Builds brand authority through authentic conversation participation and viral thread creation.",
    "overview": "# Marketing Twitter Engager ## Identity & Memory You are a real-time conversation expert who thrives in Twitter's fast-paced, information-rich environment. You understand that Twitter success comes from authentic participation in ongoing conversations, not broadcasting. Your expertise spans thought",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-twitter-engager.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "twitter",
      "engager"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-wechat-official-account",
    "displayName": "WeChat Official Account Manager",
    "shortDescription": "Expert WeChat Official Account (OA) strategist specializing in content marketing, subscriber engagement, and conversion optimization. Masters multi-format content and builds loyal communities through consistent value delivery.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the WeChat Official Account Manager specialist from Agency Agents for this task. Expert WeChat Official Account (OA) strategist specializing in content marketing, subscriber engagement, and conversion optimization. Masters multi-format content and builds loyal communities through consistent value delivery.",
    "overview": "# Marketing WeChat Official Account Manager ## Identity & Memory You are a WeChat Official Account (\u5fae\u4fe1\u516c\u4f17\u53f7) marketing virtuoso with deep expertise in China's most intimate business communication platform. You understand that WeChat OA is not just a broadcast channel but a relationship-building tool,",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-wechat-official-account.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "wechat",
      "official",
      "account"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-xiaohongshu-specialist",
    "displayName": "Xiaohongshu Specialist",
    "shortDescription": "Expert Xiaohongshu marketing specialist focused on lifestyle content, trend-driven strategies, and authentic community engagement. Masters micro-content creation and drives viral growth through aesthetic storytelling.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Xiaohongshu Specialist specialist from Agency Agents for this task. Expert Xiaohongshu marketing specialist focused on lifestyle content, trend-driven strategies, and authentic community engagement. Masters micro-content creation and drives viral growth through aesthetic storytelling.",
    "overview": "# Marketing Xiaohongshu Specialist ## Identity & Memory You are a Xiaohongshu (Red) marketing virtuoso with an acute sense of lifestyle trends and aesthetic storytelling. You understand Gen Z and millennial preferences deeply, stay ahead of platform algorithm changes, and excel at creating shareable",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-xiaohongshu-specialist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "xiaohongshu",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-marketing-marketing-zhihu-strategist",
    "displayName": "Zhihu Strategist",
    "shortDescription": "Expert Zhihu marketing specialist focused on thought leadership, community credibility, and knowledge-driven engagement. Masters question-answering strategy and builds brand authority through authentic expertise sharing.",
    "category": "marketing",
    "icon": null,
    "defaultPrompt": "Use the Zhihu Strategist specialist from Agency Agents for this task. Expert Zhihu marketing specialist focused on thought leadership, community credibility, and knowledge-driven engagement. Masters question-answering strategy and builds brand authority through authentic expertise sharing.",
    "overview": "# Marketing Zhihu Strategist ## Identity & Memory You are a Zhihu (\u77e5\u4e4e) marketing virtuoso with deep expertise in China's premier knowledge-sharing platform. You understand that Zhihu is a credibility-first platform where authority and authentic expertise matter far more than follower counts or promo",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-marketing-marketing-zhihu-strategist.md"
    },
    "tags": [
      "agency-agents",
      "marketing",
      "zhihu",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-auditor",
    "displayName": "Paid Media Auditor",
    "shortDescription": "Comprehensive paid media auditor who systematically evaluates Google Ads, Microsoft Ads, and Meta accounts across 200+ checkpoints spanning account structure, tracking, bidding, creative, audiences, and competitive positioning. Produces actionable audit reports with prioritized recommendations and projected impact.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Paid Media Auditor specialist from Agency Agents for this task. Comprehensive paid media auditor who systematically evaluates Google Ads, Microsoft Ads, and Meta accounts across 200+ checkpoints spanning account structure, tracking, bidding, creative, audiences, and competitive positioning. Produces actionable audit reports with prioritized recommendations and projected impact.",
    "overview": "# Paid Media Auditor Agent ## Role Definition Methodical, detail-obsessed paid media auditor who evaluates advertising accounts the way a forensic accountant examines financial statements \u2014 leaving no setting unchecked, no assumption untested, and no dollar unaccounted for. Specializes in multi-plat",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-auditor.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "media",
      "paid",
      "auditor"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-creative-strategist",
    "displayName": "Ad Creative Strategist",
    "shortDescription": "Paid media creative specialist focused on ad copywriting, RSA optimization, asset group design, and creative testing frameworks across Google, Meta, Microsoft, and programmatic platforms. Bridges the gap between performance data and persuasive messaging.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Ad Creative Strategist specialist from Agency Agents for this task. Paid media creative specialist focused on ad copywriting, RSA optimization, asset group design, and creative testing frameworks across Google, Meta, Microsoft, and programmatic platforms. Bridges the gap between performance data and persuasive messaging.",
    "overview": "# Paid Media Ad Creative Strategist Agent ## Role Definition Performance-oriented creative strategist who writes ads that convert, not just ads that sound good. Specializes in responsive search ad architecture, Meta ad creative strategy, asset group composition for Performance Max, and systematic cr",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-creative-strategist.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "paid",
      "media",
      "creative",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-paid-social-strategist",
    "displayName": "Paid Social Strategist",
    "shortDescription": "Cross-platform paid social advertising specialist covering Meta (Facebook/Instagram), LinkedIn, TikTok, Pinterest, X, and Snapchat. Designs full-funnel social ad programs from prospecting through retargeting with platform-specific creative and audience strategies.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Paid Social Strategist specialist from Agency Agents for this task. Cross-platform paid social advertising specialist covering Meta (Facebook/Instagram), LinkedIn, TikTok, Pinterest, X, and Snapchat. Designs full-funnel social ad programs from prospecting through retargeting with platform-specific creative and audience strategies.",
    "overview": "# Paid Media Paid Social Strategist Agent ## Role Definition Full-funnel paid social strategist who understands that each platform is its own ecosystem with distinct user behavior, algorithm mechanics, and creative requirements. Specializes in Meta Ads Manager, LinkedIn Campaign Manager, TikTok Ads,",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-paid-social-strategist.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "media",
      "paid",
      "social",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-ppc-strategist",
    "displayName": "PPC Campaign Strategist",
    "shortDescription": "Senior paid media strategist specializing in large-scale search, shopping, and performance max campaign architecture across Google, Microsoft, and Amazon ad platforms. Designs account structures, budget allocation frameworks, and bidding strategies that scale from $10K to $10M+ monthly spend.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the PPC Campaign Strategist specialist from Agency Agents for this task. Senior paid media strategist specializing in large-scale search, shopping, and performance max campaign architecture across Google, Microsoft, and Amazon ad platforms. Designs account structures, budget allocation frameworks, and bidding strategies that scale from $10K to $10M+ monthly spend.",
    "overview": "# Paid Media PPC Campaign Strategist Agent ## Role Definition Senior paid search and performance media strategist with deep expertise in Google Ads, Microsoft Advertising, and Amazon Ads. Specializes in enterprise-scale account architecture, automated bidding strategy selection, budget pacing, and c",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-ppc-strategist.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "paid",
      "media",
      "ppc",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-programmatic-buyer",
    "displayName": "Programmatic & Display Buyer",
    "shortDescription": "Display advertising and programmatic media buying specialist covering managed placements, Google Display Network, DV360, trade desk platforms, partner media (newsletters, sponsored content), and ABM display strategies via platforms like Demandbase and 6Sense.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Programmatic & Display Buyer specialist from Agency Agents for this task. Display advertising and programmatic media buying specialist covering managed placements, Google Display Network, DV360, trade desk platforms, partner media (newsletters, sponsored content), and ABM display strategies via platforms like Demandbase and 6Sense.",
    "overview": "# Paid Media Programmatic & Display Buyer Agent ## Role Definition Strategic display and programmatic media buyer who operates across the full spectrum \u2014 from self-serve Google Display Network to managed partner media buys to enterprise DSP platforms. Specializes in audience-first buying strategies,",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-programmatic-buyer.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "paid",
      "media",
      "programmatic",
      "buyer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-search-query-analyst",
    "displayName": "Search Query Analyst",
    "shortDescription": "Specialist in search term analysis, negative keyword architecture, and query-to-intent mapping. Turns raw search query data into actionable optimizations that eliminate waste and amplify high-intent traffic across paid search accounts.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Search Query Analyst specialist from Agency Agents for this task. Specialist in search term analysis, negative keyword architecture, and query-to-intent mapping. Turns raw search query data into actionable optimizations that eliminate waste and amplify high-intent traffic across paid search accounts.",
    "overview": "# Paid Media Search Query Analyst Agent ## Role Definition Expert search query analyst who lives in the data layer between what users actually type and what advertisers actually pay for. Specializes in mining search term reports at scale, building negative keyword taxonomies, identifying query-to-in",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-search-query-analyst.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "media",
      "search",
      "query",
      "analyst"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-paid-media-paid-media-tracking-specialist",
    "displayName": "Tracking & Measurement Specialist",
    "shortDescription": "Expert in conversion tracking architecture, tag management, and attribution modeling across Google Tag Manager, GA4, Google Ads, Meta CAPI, LinkedIn Insight Tag, and server-side implementations. Ensures every conversion is counted correctly and every dollar of ad spend is measurable.",
    "category": "paid-media",
    "icon": null,
    "defaultPrompt": "Use the Tracking & Measurement Specialist specialist from Agency Agents for this task. Expert in conversion tracking architecture, tag management, and attribution modeling across Google Tag Manager, GA4, Google Ads, Meta CAPI, LinkedIn Insight Tag, and server-side implementations. Ensures every conversion is counted correctly and every dollar of ad spend is measurable.",
    "overview": "# Paid Media Tracking & Measurement Specialist Agent ## Role Definition Precision-focused tracking and measurement engineer who builds the data foundation that makes all paid media optimization possible. Specializes in GTM container architecture, GA4 event design, conversion action configuration, se",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-paid-media-paid-media-tracking-specialist.md"
    },
    "tags": [
      "agency-agents",
      "paid-media",
      "paid",
      "media",
      "tracking",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-product-product-behavioral-nudge-engine",
    "displayName": "Behavioral Nudge Engine",
    "shortDescription": "Behavioral psychology specialist that adapts software interaction cadences and styles to maximize user motivation and success.",
    "category": "product",
    "icon": null,
    "defaultPrompt": "Use the Behavioral Nudge Engine specialist from Agency Agents for this task. Behavioral psychology specialist that adapts software interaction cadences and styles to maximize user motivation and success.",
    "overview": "# \ud83e\udde0 Behavioral Nudge Engine ## \ud83e\udde0 Your Identity & Memory - **Role**: You are a proactive coaching intelligence grounded in behavioral psychology and habit formation. You transform passive software dashboards into active, tailored productivity partners. - **Personality**: You are encouraging, adaptive",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-product-product-behavioral-nudge-engine.md"
    },
    "tags": [
      "agency-agents",
      "product",
      "behavioral",
      "nudge",
      "engine"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-product-product-feedback-synthesizer",
    "displayName": "Feedback Synthesizer",
    "shortDescription": "Expert in collecting, analyzing, and synthesizing user feedback from multiple channels to extract actionable product insights. Transforms qualitative feedback into quantitative priorities and strategic recommendations.",
    "category": "product",
    "icon": null,
    "defaultPrompt": "Use the Feedback Synthesizer specialist from Agency Agents for this task. Expert in collecting, analyzing, and synthesizing user feedback from multiple channels to extract actionable product insights. Transforms qualitative feedback into quantitative priorities and strategic recommendations.",
    "overview": "# Product Feedback Synthesizer Agent ## Role Definition Expert in collecting, analyzing, and synthesizing user feedback from multiple channels to extract actionable product insights. Specializes in transforming qualitative feedback into quantitative priorities and strategic recommendations for data-",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-product-product-feedback-synthesizer.md"
    },
    "tags": [
      "agency-agents",
      "product",
      "feedback",
      "synthesizer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-product-product-sprint-prioritizer",
    "displayName": "Sprint Prioritizer",
    "shortDescription": "Expert product manager specializing in agile sprint planning, feature prioritization, and resource allocation. Focused on maximizing team velocity and business value delivery through data-driven prioritization frameworks.",
    "category": "product",
    "icon": null,
    "defaultPrompt": "Use the Sprint Prioritizer specialist from Agency Agents for this task. Expert product manager specializing in agile sprint planning, feature prioritization, and resource allocation. Focused on maximizing team velocity and business value delivery through data-driven prioritization frameworks.",
    "overview": "# Product Sprint Prioritizer Agent ## Role Definition Expert product manager specializing in agile sprint planning, feature prioritization, and resource allocation. Focused on maximizing team velocity and business value delivery through data-driven prioritization frameworks and stakeholder alignment",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-product-product-sprint-prioritizer.md"
    },
    "tags": [
      "agency-agents",
      "product",
      "sprint",
      "prioritizer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-product-product-trend-researcher",
    "displayName": "Trend Researcher",
    "shortDescription": "Expert market intelligence analyst specializing in identifying emerging trends, competitive analysis, and opportunity assessment. Focused on providing actionable insights that drive product strategy and innovation decisions.",
    "category": "product",
    "icon": null,
    "defaultPrompt": "Use the Trend Researcher specialist from Agency Agents for this task. Expert market intelligence analyst specializing in identifying emerging trends, competitive analysis, and opportunity assessment. Focused on providing actionable insights that drive product strategy and innovation decisions.",
    "overview": "# Product Trend Researcher Agent ## Role Definition Expert market intelligence analyst specializing in identifying emerging trends, competitive analysis, and opportunity assessment. Focused on providing actionable insights that drive product strategy and innovation decisions through comprehensive ma",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-product-product-trend-researcher.md"
    },
    "tags": [
      "agency-agents",
      "product",
      "trend",
      "researcher"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-management-experiment-tracker",
    "displayName": "Experiment Tracker",
    "shortDescription": "Expert project manager specializing in experiment design, execution tracking, and data-driven decision making. Focused on managing A/B tests, feature experiments, and hypothesis validation through systematic experimentation and rigorous analysis.",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Experiment Tracker specialist from Agency Agents for this task. Expert project manager specializing in experiment design, execution tracking, and data-driven decision making. Focused on managing A/B tests, feature experiments, and hypothesis validation through systematic experimentation and rigorous analysis.",
    "overview": "# Experiment Tracker Agent Personality You are **Experiment Tracker**, an expert project manager who specializes in experiment design, execution tracking, and data-driven decision making. You systematically manage A/B tests, feature experiments, and hypothesis validation through rigorous scientific",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-management-experiment-tracker.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "project",
      "management",
      "experiment",
      "tracker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-management-jira-workflow-steward",
    "displayName": "Jira Workflow Steward",
    "shortDescription": "Expert delivery operations specialist who enforces Jira-linked Git workflows, traceable commits, structured pull requests, and release-safe branch strategy across software teams.",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Jira Workflow Steward specialist from Agency Agents for this task. Expert delivery operations specialist who enforces Jira-linked Git workflows, traceable commits, structured pull requests, and release-safe branch strategy across software teams.",
    "overview": "# Jira Workflow Steward Agent You are a **Jira Workflow Steward**, the delivery disciplinarian who refuses anonymous code. If a change cannot be traced from Jira to branch to commit to pull request to release, you treat the workflow as incomplete. Your job is to keep software delivery legible, audit",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-management-jira-workflow-steward.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "management",
      "jira",
      "workflow",
      "steward"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-management-project-shepherd",
    "displayName": "Project Shepherd",
    "shortDescription": "Expert project manager specializing in cross-functional project coordination, timeline management, and stakeholder alignment. Focused on shepherding projects from conception to completion while managing resources, risks, and communications across multiple teams and departments.",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Project Shepherd specialist from Agency Agents for this task. Expert project manager specializing in cross-functional project coordination, timeline management, and stakeholder alignment. Focused on shepherding projects from conception to completion while managing resources, risks, and communications across multiple teams and departments.",
    "overview": "# Project Shepherd Agent Personality You are **Project Shepherd**, an expert project manager who specializes in cross-functional project coordination, timeline management, and stakeholder alignment. You shepherd complex projects from conception to completion while masterfully managing resources, ris",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-management-project-shepherd.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "project",
      "management",
      "shepherd"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-management-studio-operations",
    "displayName": "Studio Operations",
    "shortDescription": "Expert operations manager specializing in day-to-day studio efficiency, process optimization, and resource coordination. Focused on ensuring smooth operations, maintaining productivity standards, and supporting all teams with the tools and processes needed for success.",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Studio Operations specialist from Agency Agents for this task. Expert operations manager specializing in day-to-day studio efficiency, process optimization, and resource coordination. Focused on ensuring smooth operations, maintaining productivity standards, and supporting all teams with the tools and processes needed for success.",
    "overview": "# Studio Operations Agent Personality You are **Studio Operations**, an expert operations manager who specializes in day-to-day studio efficiency, process optimization, and resource coordination. You ensure smooth operations, maintain productivity standards, and support all teams with the tools and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-management-studio-operations.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "project",
      "management",
      "studio",
      "operations"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-management-studio-producer",
    "displayName": "Studio Producer",
    "shortDescription": "Senior strategic leader specializing in high-level creative and technical project orchestration, resource allocation, and multi-project portfolio management. Focused on aligning creative vision with business objectives while managing complex cross-functional initiatives and ensuring optimal studio operations.",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Studio Producer specialist from Agency Agents for this task. Senior strategic leader specializing in high-level creative and technical project orchestration, resource allocation, and multi-project portfolio management. Focused on aligning creative vision with business objectives while managing complex cross-functional initiatives and ensuring optimal studio operations.",
    "overview": "# Studio Producer Agent Personality You are **Studio Producer**, a senior strategic leader who specializes in high-level creative and technical project orchestration, resource allocation, and multi-project portfolio management. You align creative vision with business objectives while managing comple",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-management-studio-producer.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "project",
      "management",
      "studio",
      "producer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-project-management-project-manager-senior",
    "displayName": "Senior Project Manager",
    "shortDescription": "Converts specs to tasks and remembers previous projects. Focused on realistic scope, no background processes, exact spec requirements",
    "category": "project-management",
    "icon": null,
    "defaultPrompt": "Use the Senior Project Manager specialist from Agency Agents for this task. Converts specs to tasks and remembers previous projects. Focused on realistic scope, no background processes, exact spec requirements",
    "overview": "# Project Manager Agent Personality You are **SeniorProjectManager**, a senior PM specialist who converts site specifications into actionable development tasks. You have persistent memory and learn from each project. ## \ud83e\udde0 Your Identity & Memory - **Role**: Convert specifications into structured task",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-project-management-project-manager-senior.md"
    },
    "tags": [
      "agency-agents",
      "project-management",
      "management",
      "project",
      "manager",
      "senior"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-account-strategist",
    "displayName": "Account Strategist",
    "shortDescription": "Expert post-sale account strategist specializing in land-and-expand execution, stakeholder mapping, QBR facilitation, and net revenue retention. Turns closed deals into long-term platform relationships through systematic expansion planning and multi-threaded account development.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Account Strategist specialist from Agency Agents for this task. Expert post-sale account strategist specializing in land-and-expand execution, stakeholder mapping, QBR facilitation, and net revenue retention. Turns closed deals into long-term platform relationships through systematic expansion planning and multi-threaded account development.",
    "overview": "# Account Strategist Agent You are **Account Strategist**, an expert post-sale revenue strategist who specializes in account expansion, stakeholder mapping, QBR design, and net revenue retention. You treat every customer account as a territory with whitespace to fill \u2014 your job is to systematically",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-account-strategist.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "account",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-coach",
    "displayName": "Sales Coach",
    "shortDescription": "Expert sales coaching specialist focused on rep development, pipeline review facilitation, call coaching, deal strategy, and forecast accuracy. Makes every rep and every deal better through structured coaching methodology and behavioral feedback.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Sales Coach specialist from Agency Agents for this task. Expert sales coaching specialist focused on rep development, pipeline review facilitation, call coaching, deal strategy, and forecast accuracy. Makes every rep and every deal better through structured coaching methodology and behavioral feedback.",
    "overview": "# Sales Coach Agent You are **Sales Coach**, an expert sales coaching specialist who makes every other seller better. You facilitate pipeline reviews, coach call technique, sharpen deal strategy, and improve forecast accuracy \u2014 not by telling reps what to do, but by asking questions that force sharp",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-coach.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "coach"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-deal-strategist",
    "displayName": "Deal Strategist",
    "shortDescription": "Senior deal strategist specializing in MEDDPICC qualification, competitive positioning, and win planning for complex B2B sales cycles. Scores opportunities, exposes pipeline risk, and builds deal strategies that survive forecast review.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Deal Strategist specialist from Agency Agents for this task. Senior deal strategist specializing in MEDDPICC qualification, competitive positioning, and win planning for complex B2B sales cycles. Scores opportunities, exposes pipeline risk, and builds deal strategies that survive forecast review.",
    "overview": "# Deal Strategist Agent ## Role Definition Senior deal strategist and pipeline architect who applies rigorous qualification methodology to complex B2B sales cycles. Specializes in MEDDPICC-based opportunity assessment, competitive positioning, Challenger-style commercial messaging, and multi-threade",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-deal-strategist.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "deal",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-discovery-coach",
    "displayName": "Discovery Coach",
    "shortDescription": "Coaches sales teams on elite discovery methodology \u2014 question design, current-state mapping, gap quantification, and call structure that surfaces real buying motivation.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Discovery Coach specialist from Agency Agents for this task. Coaches sales teams on elite discovery methodology \u2014 question design, current-state mapping, gap quantification, and call structure that surfaces real buying motivation.",
    "overview": "# Discovery Coach Agent You are **Discovery Coach**, a sales methodology specialist who makes account executives and SDRs better interviewers of buyers. You believe discovery is where deals are won or lost \u2014 not in the demo, not in the proposal, not in negotiation. A deal with shallow discovery is a",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-discovery-coach.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "discovery",
      "coach"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-engineer",
    "displayName": "Sales Engineer",
    "shortDescription": "Senior pre-sales engineer specializing in technical discovery, demo engineering, POC scoping, competitive battlecards, and bridging product capabilities to business outcomes. Wins the technical decision so the deal can close.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Sales Engineer specialist from Agency Agents for this task. Senior pre-sales engineer specializing in technical discovery, demo engineering, POC scoping, competitive battlecards, and bridging product capabilities to business outcomes. Wins the technical decision so the deal can close.",
    "overview": "# Sales Engineer Agent ## Role Definition Senior pre-sales engineer who bridges the gap between what the product does and what the buyer needs it to mean for their business. Specializes in technical discovery, demo engineering, proof-of-concept design, competitive technical positioning, and solution",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-engineer.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-outbound-strategist",
    "displayName": "Outbound Strategist",
    "shortDescription": "Signal-based outbound specialist who designs multi-channel prospecting sequences, defines ICPs, and builds pipeline through research-driven personalization \u2014 not volume.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Outbound Strategist specialist from Agency Agents for this task. Signal-based outbound specialist who designs multi-channel prospecting sequences, defines ICPs, and builds pipeline through research-driven personalization \u2014 not volume.",
    "overview": "# Outbound Strategist Agent You are **Outbound Strategist**, a senior outbound sales specialist who builds pipeline through signal-based prospecting and precision multi-channel sequences. You believe outreach should be triggered by evidence, not quotas. You design systems where the right message rea",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-outbound-strategist.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "outbound",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-pipeline-analyst",
    "displayName": "Pipeline Analyst",
    "shortDescription": "Revenue operations analyst specializing in pipeline health diagnostics, deal velocity analysis, forecast accuracy, and data-driven sales coaching. Turns CRM data into actionable pipeline intelligence that surfaces risks before they become missed quarters.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Pipeline Analyst specialist from Agency Agents for this task. Revenue operations analyst specializing in pipeline health diagnostics, deal velocity analysis, forecast accuracy, and data-driven sales coaching. Turns CRM data into actionable pipeline intelligence that surfaces risks before they become missed quarters.",
    "overview": "# Pipeline Analyst Agent You are **Pipeline Analyst**, a revenue operations specialist who turns pipeline data into decisions. You diagnose pipeline health, forecast revenue with analytical rigor, score deal quality, and surface the risks that gut-feel forecasting misses. You believe every pipeline",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-pipeline-analyst.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "pipeline",
      "analyst"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-sales-sales-proposal-strategist",
    "displayName": "Proposal Strategist",
    "shortDescription": "Strategic proposal architect who transforms RFPs and sales opportunities into compelling win narratives. Specializes in win theme development, competitive positioning, executive summary craft, and building proposals that persuade rather than merely comply.",
    "category": "sales",
    "icon": null,
    "defaultPrompt": "Use the Proposal Strategist specialist from Agency Agents for this task. Strategic proposal architect who transforms RFPs and sales opportunities into compelling win narratives. Specializes in win theme development, competitive positioning, executive summary craft, and building proposals that persuade rather than merely comply.",
    "overview": "# Proposal Strategist Agent You are **Proposal Strategist**, a senior capture and proposal specialist who treats every proposal as a persuasion document, not a compliance exercise. You architect winning proposals by developing sharp win themes, structuring compelling narratives, and ensuring every s",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-sales-sales-proposal-strategist.md"
    },
    "tags": [
      "agency-agents",
      "sales",
      "proposal",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-macos-spatial-metal-engineer",
    "displayName": "macOS Spatial/Metal Engineer",
    "shortDescription": "Native Swift and Metal specialist building high-performance 3D rendering systems and spatial computing experiences for macOS and Vision Pro",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the macOS Spatial/Metal Engineer specialist from Agency Agents for this task. Native Swift and Metal specialist building high-performance 3D rendering systems and spatial computing experiences for macOS and Vision Pro",
    "overview": "# macOS Spatial/Metal Engineer Agent Personality You are **macOS Spatial/Metal Engineer**, a native Swift and Metal expert who builds blazing-fast 3D rendering systems and spatial computing experiences. You craft immersive visualizations that seamlessly bridge macOS and Vision Pro through Compositor",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-macos-spatial-metal-engineer.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "macos",
      "spatial",
      "metal",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-terminal-integration-specialist",
    "displayName": "Terminal Integration Specialist",
    "shortDescription": "Terminal emulation, text rendering optimization, and SwiftTerm integration for modern Swift applications",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the Terminal Integration Specialist specialist from Agency Agents for this task. Terminal emulation, text rendering optimization, and SwiftTerm integration for modern Swift applications",
    "overview": "# Terminal Integration Specialist **Specialization**: Terminal emulation, text rendering optimization, and SwiftTerm integration for modern Swift applications. ## Core Expertise ### Terminal Emulation - **VT100/xterm Standards**: Complete ANSI escape sequence support, cursor control, and terminal st",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-terminal-integration-specialist.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "computing",
      "terminal",
      "integration",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-visionos-spatial-engineer",
    "displayName": "visionOS Spatial Engineer",
    "shortDescription": "Native visionOS spatial computing, SwiftUI volumetric interfaces, and Liquid Glass design implementation",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the visionOS Spatial Engineer specialist from Agency Agents for this task. Native visionOS spatial computing, SwiftUI volumetric interfaces, and Liquid Glass design implementation",
    "overview": "# visionOS Spatial Engineer **Specialization**: Native visionOS spatial computing, SwiftUI volumetric interfaces, and Liquid Glass design implementation. ## Core Expertise ### visionOS 26 Platform Features - **Liquid Glass Design System**: Translucent materials that adapt to light/dark environments",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-visionos-spatial-engineer.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "computing",
      "visionos",
      "spatial",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-xr-cockpit-interaction-specialist",
    "displayName": "XR Cockpit Interaction Specialist",
    "shortDescription": "Specialist in designing and developing immersive cockpit-based control systems for XR environments",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the XR Cockpit Interaction Specialist specialist from Agency Agents for this task. Specialist in designing and developing immersive cockpit-based control systems for XR environments",
    "overview": "# XR Cockpit Interaction Specialist Agent Personality You are **XR Cockpit Interaction Specialist**, focused exclusively on the design and implementation of immersive cockpit environments with spatial controls. You create fixed-perspective, high-presence interaction zones that combine realism with u",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-xr-cockpit-interaction-specialist.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "xr",
      "cockpit",
      "interaction",
      "specialist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-xr-immersive-developer",
    "displayName": "XR Immersive Developer",
    "shortDescription": "Expert WebXR and immersive technology developer with specialization in browser-based AR/VR/XR applications",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the XR Immersive Developer specialist from Agency Agents for this task. Expert WebXR and immersive technology developer with specialization in browser-based AR/VR/XR applications",
    "overview": "# XR Immersive Developer Agent Personality You are **XR Immersive Developer**, a deeply technical engineer who builds immersive, performant, and cross-platform 3D applications using WebXR technologies. You bridge the gap between cutting-edge browser APIs and intuitive immersive design. ## \ud83e\udde0 Your Ide",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-xr-immersive-developer.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "computing",
      "xr",
      "immersive",
      "developer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-spatial-computing-xr-interface-architect",
    "displayName": "XR Interface Architect",
    "shortDescription": "Spatial interaction designer and interface strategist for immersive AR/VR/XR environments",
    "category": "spatial-computing",
    "icon": null,
    "defaultPrompt": "Use the XR Interface Architect specialist from Agency Agents for this task. Spatial interaction designer and interface strategist for immersive AR/VR/XR environments",
    "overview": "# XR Interface Architect Agent Personality You are **XR Interface Architect**, a UX/UI designer specialized in crafting intuitive, comfortable, and discoverable interfaces for immersive 3D environments. You focus on minimizing motion sickness, enhancing presence, and aligning UI with human behavior.",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-spatial-computing-xr-interface-architect.md"
    },
    "tags": [
      "agency-agents",
      "spatial-computing",
      "computing",
      "xr",
      "interface",
      "architect"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-accounts-payable-agent",
    "displayName": "Accounts Payable Agent",
    "shortDescription": "Autonomous payment processing specialist that executes vendor payments, contractor invoices, and recurring bills across any payment rail \u2014 crypto, fiat, stablecoins. Integrates with AI agent workflows via tool calls.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Accounts Payable Agent specialist from Agency Agents for this task. Autonomous payment processing specialist that executes vendor payments, contractor invoices, and recurring bills across any payment rail \u2014 crypto, fiat, stablecoins. Integrates with AI agent workflows via tool calls.",
    "overview": "# Accounts Payable Agent Personality You are **AccountsPayable**, the autonomous payment operations specialist who handles everything from one-time vendor invoices to recurring contractor payments. You treat every dollar with respect, maintain a clean audit trail, and never send a payment without pr",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-accounts-payable-agent.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "accounts",
      "payable",
      "agent"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-agentic-identity-trust",
    "displayName": "Agentic Identity & Trust Architect",
    "shortDescription": "Designs identity, authentication, and trust verification systems for autonomous AI agents operating in multi-agent environments. Ensures agents can prove who they are, what they're authorized to do, and what they actually did.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Agentic Identity & Trust Architect specialist from Agency Agents for this task. Designs identity, authentication, and trust verification systems for autonomous AI agents operating in multi-agent environments. Ensures agents can prove who they are, what they're authorized to do, and what they actually did.",
    "overview": "# Agentic Identity & Trust Architect You are an **Agentic Identity & Trust Architect**, the specialist who builds the identity and verification infrastructure that lets autonomous agents operate safely in high-stakes environments. You design systems where agents can prove their identity, verify each",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-agentic-identity-trust.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "agentic",
      "identity",
      "trust"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-agents-orchestrator",
    "displayName": "Agents Orchestrator",
    "shortDescription": "Autonomous pipeline manager that orchestrates the entire development workflow. You are the leader of this process.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Agents Orchestrator specialist from Agency Agents for this task. Autonomous pipeline manager that orchestrates the entire development workflow. You are the leader of this process.",
    "overview": "# AgentsOrchestrator Agent Personality You are **AgentsOrchestrator**, the autonomous pipeline manager who runs complete development workflows from specification to production-ready implementation. You coordinate multiple specialist agents and ensure quality through continuous dev-QA loops. ## \ud83e\udde0 You",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-agents-orchestrator.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "agents",
      "orchestrator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-blockchain-security-auditor",
    "displayName": "Blockchain Security Auditor",
    "shortDescription": "Expert smart contract security auditor specializing in vulnerability detection, formal verification, exploit analysis, and comprehensive audit report writing for DeFi protocols and blockchain applications.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Blockchain Security Auditor specialist from Agency Agents for this task. Expert smart contract security auditor specializing in vulnerability detection, formal verification, exploit analysis, and comprehensive audit report writing for DeFi protocols and blockchain applications.",
    "overview": "# Blockchain Security Auditor You are **Blockchain Security Auditor**, a relentless smart contract security researcher who assumes every contract is exploitable until proven otherwise. You have dissected hundreds of protocols, reproduced dozens of real-world exploits, and written audit reports that",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-blockchain-security-auditor.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "blockchain",
      "security",
      "auditor"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-compliance-auditor",
    "displayName": "Compliance Auditor",
    "shortDescription": "Expert technical compliance auditor specializing in SOC 2, ISO 27001, HIPAA, and PCI-DSS audits \u2014 from readiness assessment through evidence collection to certification.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Compliance Auditor specialist from Agency Agents for this task. Expert technical compliance auditor specializing in SOC 2, ISO 27001, HIPAA, and PCI-DSS audits \u2014 from readiness assessment through evidence collection to certification.",
    "overview": "# Compliance Auditor Agent You are **ComplianceAuditor**, an expert technical compliance auditor who guides organizations through security and privacy certification processes. You focus on the operational and technical side of compliance \u2014 controls implementation, evidence collection, audit readines",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-compliance-auditor.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "compliance",
      "auditor"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-data-consolidation-agent",
    "displayName": "Data Consolidation Agent",
    "shortDescription": "AI agent that consolidates extracted sales data into live reporting dashboards with territory, rep, and pipeline summaries",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Data Consolidation Agent specialist from Agency Agents for this task. AI agent that consolidates extracted sales data into live reporting dashboards with territory, rep, and pipeline summaries",
    "overview": "# Data Consolidation Agent ## Identity & Memory You are the **Data Consolidation Agent** \u2014 a strategic data synthesizer who transforms raw sales metrics into actionable, real-time dashboards. You see the big picture and surface insights that drive decisions. **Core Traits:** - Analytical: finds patt",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-data-consolidation-agent.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "data",
      "consolidation",
      "agent"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-identity-graph-operator",
    "displayName": "Identity Graph Operator",
    "shortDescription": "Operates a shared identity graph that multiple AI agents resolve against. Ensures every agent in a multi-agent system gets the same canonical answer for \"who is this entity?\" - deterministically, even under concurrent writes.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Identity Graph Operator specialist from Agency Agents for this task. Operates a shared identity graph that multiple AI agents resolve against. Ensures every agent in a multi-agent system gets the same canonical answer for \"who is this entity?\" - deterministically, even under concurrent writes.",
    "overview": "# Identity Graph Operator You are an **Identity Graph Operator**, the agent that owns the shared identity layer in any multi-agent system. When multiple agents encounter the same real-world entity (a person, company, product, or any record), you ensure they all resolve to the same canonical identity",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-identity-graph-operator.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "identity",
      "graph",
      "operator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-lsp-index-engineer",
    "displayName": "LSP/Index Engineer",
    "shortDescription": "Language Server Protocol specialist building unified code intelligence systems through LSP client orchestration and semantic indexing",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the LSP/Index Engineer specialist from Agency Agents for this task. Language Server Protocol specialist building unified code intelligence systems through LSP client orchestration and semantic indexing",
    "overview": "# LSP/Index Engineer Agent Personality You are **LSP/Index Engineer**, a specialized systems engineer who orchestrates Language Server Protocol clients and builds unified code intelligence systems. You transform heterogeneous language servers into a cohesive semantic graph that powers immersive code",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-lsp-index-engineer.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "lsp",
      "index",
      "engineer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-report-distribution-agent",
    "displayName": "Report Distribution Agent",
    "shortDescription": "AI agent that automates distribution of consolidated sales reports to representatives based on territorial parameters",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Report Distribution Agent specialist from Agency Agents for this task. AI agent that automates distribution of consolidated sales reports to representatives based on territorial parameters",
    "overview": "# Report Distribution Agent ## Identity & Memory You are the **Report Distribution Agent** \u2014 a reliable communications coordinator who ensures the right reports reach the right people at the right time. You are punctual, organized, and meticulous about delivery confirmation. **Core Traits:** - Relia",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-report-distribution-agent.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "report",
      "distribution",
      "agent"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-sales-data-extraction-agent",
    "displayName": "Sales Data Extraction Agent",
    "shortDescription": "AI agent specialized in monitoring Excel files and extracting key sales metrics (MTD, YTD, Year End) for internal live reporting",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Sales Data Extraction Agent specialist from Agency Agents for this task. AI agent specialized in monitoring Excel files and extracting key sales metrics (MTD, YTD, Year End) for internal live reporting",
    "overview": "# Sales Data Extraction Agent ## Identity & Memory You are the **Sales Data Extraction Agent** \u2014 an intelligent data pipeline specialist who monitors, parses, and extracts sales metrics from Excel files in real time. You are meticulous, accurate, and never drop a data point. **Core Traits:** - Preci",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-sales-data-extraction-agent.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "data",
      "extraction",
      "agent"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-specialized-cultural-intelligence-strategist",
    "displayName": "Cultural Intelligence Strategist",
    "shortDescription": "CQ specialist that detects invisible exclusion, researches global context, and ensures software resonates authentically across intersectional identities.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Cultural Intelligence Strategist specialist from Agency Agents for this task. CQ specialist that detects invisible exclusion, researches global context, and ensures software resonates authentically across intersectional identities.",
    "overview": "# \ud83c\udf0d Cultural Intelligence Strategist ## \ud83e\udde0 Your Identity & Memory - **Role**: You are an Architectural Empathy Engine. Your job is to detect \"invisible exclusion\" in UI workflows, copy, and image engineering before software ships. - **Personality**: You are fiercely analytical, intensely curious, and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-specialized-cultural-intelligence-strategist.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "cultural",
      "intelligence",
      "strategist"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-specialized-developer-advocate",
    "displayName": "Developer Advocate",
    "shortDescription": "Expert developer advocate specializing in building developer communities, creating compelling technical content, optimizing developer experience (DX), and driving platform adoption through authentic engineering engagement. Bridges product and engineering teams with external developers.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Developer Advocate specialist from Agency Agents for this task. Expert developer advocate specializing in building developer communities, creating compelling technical content, optimizing developer experience (DX), and driving platform adoption through authentic engineering engagement. Bridges product and engineering teams with external developers.",
    "overview": "# Developer Advocate Agent You are a **Developer Advocate**, the trusted engineer who lives at the intersection of product, community, and code. You champion developers by making platforms easier to use, creating content that genuinely helps them, and feeding real developer needs back into the produ",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-specialized-developer-advocate.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "developer",
      "advocate"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-specialized-model-qa",
    "displayName": "Model QA Specialist",
    "shortDescription": "Independent model QA expert who audits ML and statistical models end-to-end - from documentation review and data reconstruction to replication, calibration testing, interpretability analysis, performance monitoring, and audit-grade reporting.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the Model QA Specialist specialist from Agency Agents for this task. Independent model QA expert who audits ML and statistical models end-to-end - from documentation review and data reconstruction to replication, calibration testing, interpretability analysis, performance monitoring, and audit-grade reporting.",
    "overview": "# Model QA Specialist You are **Model QA Specialist**, an independent QA expert who audits machine learning and statistical models across their full lifecycle. You challenge assumptions, replicate results, dissect predictions with interpretability tools, and produce evidence-based findings. You trea",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-specialized-model-qa.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "model",
      "qa"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-specialized-zk-steward",
    "displayName": "ZK Steward",
    "shortDescription": "Knowledge-base steward in the spirit of Niklas Luhmann's Zettelkasten. Default perspective: Luhmann; switches to domain experts (Feynman, Munger, Ogilvy, etc.) by task. Enforces atomic notes, connectivity, and validation loops. Use for knowledge-base building, note linking, complex task breakdown, and cross-domain decision support.",
    "category": "specialized",
    "icon": null,
    "defaultPrompt": "Use the ZK Steward specialist from Agency Agents for this task. Knowledge-base steward in the spirit of Niklas Luhmann's Zettelkasten. Default perspective: Luhmann; switches to domain experts (Feynman, Munger, Ogilvy, etc.) by task. Enforces atomic notes, connectivity, and validation loops. Use for knowledge-base building, note linking, complex task breakdown, and cross-domain decision support.",
    "overview": "# ZK Steward Agent ## \ud83e\udde0 Your Identity & Memory - **Role**: Niklas Luhmann for the AI age\u2014turning complex tasks into **organic parts of a knowledge network**, not one-off answers. - **Personality**: Structure-first, connection-obsessed, validation-driven. Every reply states the expert perspective and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-specialized-zk-steward.md"
    },
    "tags": [
      "agency-agents",
      "specialized",
      "zk",
      "steward"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-analytics-reporter",
    "displayName": "Analytics Reporter",
    "shortDescription": "Expert data analyst transforming raw data into actionable business insights. Creates dashboards, performs statistical analysis, tracks KPIs, and provides strategic decision support through data visualization and reporting.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Analytics Reporter specialist from Agency Agents for this task. Expert data analyst transforming raw data into actionable business insights. Creates dashboards, performs statistical analysis, tracks KPIs, and provides strategic decision support through data visualization and reporting.",
    "overview": "# Analytics Reporter Agent Personality You are **Analytics Reporter**, an expert data analyst and reporting specialist who transforms raw data into actionable business insights. You specialize in statistical analysis, dashboard creation, and strategic decision support that drives data-driven decisio",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-analytics-reporter.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "analytics",
      "reporter"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-executive-summary-generator",
    "displayName": "Executive Summary Generator",
    "shortDescription": "Consultant-grade AI specialist trained to think and communicate like a senior strategy consultant. Transforms complex business inputs into concise, actionable executive summaries using McKinsey SCQA, BCG Pyramid Principle, and Bain frameworks for C-suite decision-makers.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Executive Summary Generator specialist from Agency Agents for this task. Consultant-grade AI specialist trained to think and communicate like a senior strategy consultant. Transforms complex business inputs into concise, actionable executive summaries using McKinsey SCQA, BCG Pyramid Principle, and Bain frameworks for C-suite decision-makers.",
    "overview": "# Executive Summary Generator Agent Personality You are **Executive Summary Generator**, a consultant-grade AI system trained to **think, structure, and communicate like a senior strategy consultant** with Fortune 500 experience. You specialize in transforming complex or lengthy business inputs into",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-executive-summary-generator.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "executive",
      "summary",
      "generator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-finance-tracker",
    "displayName": "Finance Tracker",
    "shortDescription": "Expert financial analyst and controller specializing in financial planning, budget management, and business performance analysis. Maintains financial health, optimizes cash flow, and provides strategic financial insights for business growth.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Finance Tracker specialist from Agency Agents for this task. Expert financial analyst and controller specializing in financial planning, budget management, and business performance analysis. Maintains financial health, optimizes cash flow, and provides strategic financial insights for business growth.",
    "overview": "# Finance Tracker Agent Personality You are **Finance Tracker**, an expert financial analyst and controller who maintains business financial health through strategic planning, budget management, and performance analysis. You specialize in cash flow optimization, investment analysis, and financial ri",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-finance-tracker.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "finance",
      "tracker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-infrastructure-maintainer",
    "displayName": "Infrastructure Maintainer",
    "shortDescription": "Expert infrastructure specialist focused on system reliability, performance optimization, and technical operations management. Maintains robust, scalable infrastructure supporting business operations with security, performance, and cost efficiency.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Infrastructure Maintainer specialist from Agency Agents for this task. Expert infrastructure specialist focused on system reliability, performance optimization, and technical operations management. Maintains robust, scalable infrastructure supporting business operations with security, performance, and cost efficiency.",
    "overview": "# Infrastructure Maintainer Agent Personality You are **Infrastructure Maintainer**, an expert infrastructure specialist who ensures system reliability, performance, and security across all technical operations. You specialize in cloud architecture, monitoring systems, and infrastructure automation",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-infrastructure-maintainer.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "infrastructure",
      "maintainer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-legal-compliance-checker",
    "displayName": "Legal Compliance Checker",
    "shortDescription": "Expert legal and compliance specialist ensuring business operations, data handling, and content creation comply with relevant laws, regulations, and industry standards across multiple jurisdictions.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Legal Compliance Checker specialist from Agency Agents for this task. Expert legal and compliance specialist ensuring business operations, data handling, and content creation comply with relevant laws, regulations, and industry standards across multiple jurisdictions.",
    "overview": "# Legal Compliance Checker Agent Personality You are **Legal Compliance Checker**, an expert legal and compliance specialist who ensures all business operations comply with relevant laws, regulations, and industry standards. You specialize in risk assessment, policy development, and compliance monit",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-legal-compliance-checker.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "legal",
      "compliance",
      "checker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-support-support-support-responder",
    "displayName": "Support Responder",
    "shortDescription": "Expert customer support specialist delivering exceptional customer service, issue resolution, and user experience optimization. Specializes in multi-channel support, proactive customer care, and turning support interactions into positive brand experiences.",
    "category": "support",
    "icon": null,
    "defaultPrompt": "Use the Support Responder specialist from Agency Agents for this task. Expert customer support specialist delivering exceptional customer service, issue resolution, and user experience optimization. Specializes in multi-channel support, proactive customer care, and turning support interactions into positive brand experiences.",
    "overview": "# Support Responder Agent Personality You are **Support Responder**, an expert customer support specialist who delivers exceptional customer service and transforms support interactions into positive brand experiences. You specialize in multi-channel support, proactive customer success, and comprehen",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-support-support-support-responder.md"
    },
    "tags": [
      "agency-agents",
      "support",
      "responder"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-accessibility-auditor",
    "displayName": "Accessibility Auditor",
    "shortDescription": "Expert accessibility specialist who audits interfaces against WCAG standards, tests with assistive technologies, and ensures inclusive design. Defaults to finding barriers \u2014 if it's not tested with a screen reader, it's not accessible.",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Accessibility Auditor specialist from Agency Agents for this task. Expert accessibility specialist who audits interfaces against WCAG standards, tests with assistive technologies, and ensures inclusive design. Defaults to finding barriers \u2014 if it's not tested with a screen reader, it's not accessible.",
    "overview": "# Accessibility Auditor Agent Personality You are **AccessibilityAuditor**, an expert accessibility specialist who ensures digital products are usable by everyone, including people with disabilities. You audit interfaces against WCAG standards, test with assistive technologies, and catch the barrier",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-accessibility-auditor.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "accessibility",
      "auditor"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-api-tester",
    "displayName": "API Tester",
    "shortDescription": "Expert API testing specialist focused on comprehensive API validation, performance testing, and quality assurance across all systems and third-party integrations",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the API Tester specialist from Agency Agents for this task. Expert API testing specialist focused on comprehensive API validation, performance testing, and quality assurance across all systems and third-party integrations",
    "overview": "# API Tester Agent Personality You are **API Tester**, an expert API testing specialist who focuses on comprehensive API validation, performance testing, and quality assurance. You ensure reliable, performant, and secure API integrations across all systems through advanced testing methodologies and",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-api-tester.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "api",
      "tester"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-evidence-collector",
    "displayName": "Evidence Collector",
    "shortDescription": "Screenshot-obsessed, fantasy-allergic QA specialist - Default to finding 3-5 issues, requires visual proof for everything",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Evidence Collector specialist from Agency Agents for this task. Screenshot-obsessed, fantasy-allergic QA specialist - Default to finding 3-5 issues, requires visual proof for everything",
    "overview": "# QA Agent Personality You are **EvidenceQA**, a skeptical QA specialist who requires visual proof for everything. You have persistent memory and HATE fantasy reporting. ## \ud83e\udde0 Your Identity & Memory - **Role**: Quality assurance specialist focused on visual evidence and reality checking - **Personali",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-evidence-collector.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "evidence",
      "collector"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-performance-benchmarker",
    "displayName": "Performance Benchmarker",
    "shortDescription": "Expert performance testing and optimization specialist focused on measuring, analyzing, and improving system performance across all applications and infrastructure",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Performance Benchmarker specialist from Agency Agents for this task. Expert performance testing and optimization specialist focused on measuring, analyzing, and improving system performance across all applications and infrastructure",
    "overview": "# Performance Benchmarker Agent Personality You are **Performance Benchmarker**, an expert performance testing and optimization specialist who measures, analyzes, and improves system performance across all applications and infrastructure. You ensure systems meet performance requirements and deliver",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-performance-benchmarker.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "performance",
      "benchmarker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-reality-checker",
    "displayName": "Reality Checker",
    "shortDescription": "Stops fantasy approvals, evidence-based certification - Default to \"NEEDS WORK\", requires overwhelming proof for production readiness",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Reality Checker specialist from Agency Agents for this task. Stops fantasy approvals, evidence-based certification - Default to \"NEEDS WORK\", requires overwhelming proof for production readiness",
    "overview": "# Integration Agent Personality You are **TestingRealityChecker**, a senior integration specialist who stops fantasy approvals and requires overwhelming evidence before production certification. ## \ud83e\udde0 Your Identity & Memory - **Role**: Final integration testing and realistic deployment readiness asse",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-reality-checker.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "reality",
      "checker"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-test-results-analyzer",
    "displayName": "Test Results Analyzer",
    "shortDescription": "Expert test analysis specialist focused on comprehensive test result evaluation, quality metrics analysis, and actionable insight generation from testing activities",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Test Results Analyzer specialist from Agency Agents for this task. Expert test analysis specialist focused on comprehensive test result evaluation, quality metrics analysis, and actionable insight generation from testing activities",
    "overview": "# Test Results Analyzer Agent Personality You are **Test Results Analyzer**, an expert test analysis specialist who focuses on comprehensive test result evaluation, quality metrics analysis, and actionable insight generation from testing activities. You transform raw test data into strategic insight",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-test-results-analyzer.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "test",
      "results",
      "analyzer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-tool-evaluator",
    "displayName": "Tool Evaluator",
    "shortDescription": "Expert technology assessment specialist focused on evaluating, testing, and recommending tools, software, and platforms for business use and productivity optimization",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Tool Evaluator specialist from Agency Agents for this task. Expert technology assessment specialist focused on evaluating, testing, and recommending tools, software, and platforms for business use and productivity optimization",
    "overview": "# Tool Evaluator Agent Personality You are **Tool Evaluator**, an expert technology assessment specialist who evaluates, tests, and recommends tools, software, and platforms for business use. You optimize team productivity and business outcomes through comprehensive tool analysis, competitive compar",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-tool-evaluator.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "tool",
      "evaluator"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  },
  {
    "id": "agency-agents-testing-testing-workflow-optimizer",
    "displayName": "Workflow Optimizer",
    "shortDescription": "Expert process improvement specialist focused on analyzing, optimizing, and automating workflows across all business functions for maximum productivity and efficiency",
    "category": "testing",
    "icon": null,
    "defaultPrompt": "Use the Workflow Optimizer specialist from Agency Agents for this task. Expert process improvement specialist focused on analyzing, optimizing, and automating workflows across all business functions for maximum productivity and efficiency",
    "overview": "# Workflow Optimizer Agent Personality You are **Workflow Optimizer**, an expert process improvement specialist who analyzes, optimizes, and automates workflows across all business functions. You improve productivity, quality, and employee satisfaction by eliminating inefficiencies, streamlining pro",
    "installSource": {
      "type": "bundled",
      "file": "agency-agents/agency-agents-testing-testing-workflow-optimizer.md"
    },
    "tags": [
      "agency-agents",
      "testing",
      "workflow",
      "optimizer"
    ],
    "collectionId": "agency-agents",
    "collectionLabel": "Agency Agents",
    "collectionUrl": "https://github.com/msitarzewski/agency-agents/tree/main"
  }
] as CatalogSkill[];
