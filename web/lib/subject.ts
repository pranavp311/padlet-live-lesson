// Lesson subjects Jev chooses between to pick the lesson's icon. Descriptions are Jev's option criteria.
export const SUBJECTS = {
  math: "Mathematics: numbers, algebra, geometry, graphs, statistics",
  biology: "Biology or life science: plants, animals, the human body, cells, ecosystems",
  chemistry: "Chemistry: elements, compounds, reactions, molecules",
  physics: "Physics: forces, energy, motion, electricity, light, space",
  history: "History: past events, people, empires, wars",
  geography: "Geography or earth science: places, maps, climate, weather, landforms",
  literature: "Literature or English: books, poems, stories, writing, grammar",
  languages: "A foreign language lesson",
  art: "Art or design: drawing, painting, art history",
  music: "Music",
  computing: "Computing: programming, computers, the internet",
  other: "Any other subject, or the subject isn't clear",
} as const;
export type Subject = keyof typeof SUBJECTS;
