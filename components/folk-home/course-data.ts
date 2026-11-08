export const COURSE_FACTS = {
  title: "Gita Life Foundation Course",
  tagline: "Learn Fundamental Principles of Bhagavad Gita",
  audience: "Specially Designed for Youth (Men 18-28 years)",
  time: "6:30 PM - 7:30 PM",
  days: "Every Saturday & Sunday",
  areas: "Karapakkam / Shollinganallur / Thoraipakkam",
  fee: "Rs. 500",
  phone: "97908 91979",
  phoneHref: "tel:9790891979",
  email: "gitalifechennai@gmail.com",
} as const

export const PAYMENT_METHODS = [
  { id: "gpay", label: "GPay / UPI" },
  { id: "neft", label: "NEFT / IMPS" },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"]

export const BANK_DETAILS = {
  accountName: "Touchstone Foundation Chennai",
  accountNumber: "50100736447897",
  ifscCode: "HDFC0004102",
  bankName: "HDFC Bank",
  branch: "Valmiki Nagar",
} as const

export const EXPERIENCE_ITEMS = [
  {
    title: "Vedic Discourse",
    description: "Learn fundamental principles of Gita from experienced teachers",
    image: "/gita-life/session-8.png",
    width: 2025,
    height: 1502,
  },
  {
    title: "Divine Music",
    description: "Experience the bliss of devotional music and kirtan",
    image: "/gita-life/session-6.png",
    width: 1810,
    height: 2531,
  },
  {
    title: "Soulful Delicacies",
    description: "Relish sanctified prasadam prepared with love and devotion",
    image: "/gita-life/session-7.png",
    width: 2025,
    height: 1517,
  },
  {
    title: "Mantra Meditation",
    description: "Learn the art of mantra meditation for inner peace",
    image: "/gita-life/session-9.png",
    width: 2025,
    height: 1343,
  },
] as const

export const BIG_QUESTIONS = [
  "What happens after death?",
  "God: fact or fiction?",
  "What is the real purpose of life?",
  "Why are problems rising despite scientific progress?",
] as const

export const COURSE_CHAPTERS = [
  {
    title: "Seeing the Aim of Life",
    question:
      "Why does modern life feel so empty despite our incredible technological and material progress?",
  },
  {
    title: "Spirituality",
    question:
      "Is spirituality just blind faith, or is there a missing link between religion, morality, and philosophy?",
  },
  {
    title: "You Are Not the Body",
    question: "If you aren't your name, your job, or even your physical body, then who are you really?",
  },
  {
    title: "Consciousness",
    question:
      'What is the mysterious force that makes us "alive," and where does it go when the body dies?',
  },
  {
    title: "God by Intelligent Design",
    question:
      "Can the complexity of the universe really be an accident, or is there a mathematical logic pointing to a creator?",
  },
  {
    title: "God by Creative Design",
    question:
      "Beyond logic, is the sheer beauty of nature a silent testimony to a supreme artist?",
  },
  {
    title: "Sankhya Yoga - The Gross Body",
    question:
      "What are the five fundamental elements that build our physical machine, and how do they function?",
  },
  {
    title: "Sankhya Yoga - The Subtle Body",
    question:
      "How do the invisible forces of mind, intelligence, and ego control our daily choices and emotions?",
  },
  {
    title: "The Pleasure Principle",
    question:
      "Why does every material pleasure eventually fade, and is there a joy that actually lasts?",
  },
  {
    title: "Karma",
    question:
      "Is life just a series of random events, or is there an invisible law of action and reaction governing our fate?",
  },
  {
    title: "The Laws of Karma",
    question:
      "Why do bad things happen to good people, and is there a way to finally break the cycle of destiny?",
  },
  {
    title: "Saints and Swindlers",
    question:
      'In a world full of "gurus," how can you tell the difference between a genuine guide and a spiritual pretender?',
  },
  {
    title: "Three Conceptions of Divine",
    question: "Is God a light, a witness in the heart, or a person—or could He be all three at once?",
  },
  {
    title: "The Yoga Ladder",
    question:
      "Are all spiritual paths the same, or is there a step-by-step ladder leading to the highest state of consciousness?",
  },
  {
    title: "The Three Modes of Material Nature",
    question: 'What are the three invisible "ropes" that pull the strings of your personality and behavior?',
  },
  {
    title: "The Kingdom of God",
    question:
      "Is there a place beyond time and space where life is defined by eternity, knowledge, and bliss?",
  },
  {
    title: "Yuga Dharma",
    question:
      "Of all the ancient spiritual practices, which one is specifically designed to work in our modern, chaotic age?",
  },
  {
    title: "Yuga Avatara",
    question:
      "Who is the divine personality that descends today to lead us back to our original home?",
  },
] as const
