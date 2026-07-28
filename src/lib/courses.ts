export const COURSES = ["Engineering", "Polytechnic", "Pharmacy"] as const;
export type Course = (typeof COURSES)[number];

export const BRANCHES: Record<Course, string[]> = {
  Engineering: [
    "Mechanical",
    "E&TC",
    "Artificial Intelligence",
    "Electronics and Telecommunication",
  ],
  Polytechnic: ["Mechanical", "E&TC", "Electronics and Telecommunication"],
  Pharmacy: ["D. Pharm", "B. Pharm"],
};

export const DEFAULT_EXAM_FEE = 50000;
export const DEFAULT_TUITION_FEE_BY_COURSE: Record<Course, number> = {
  Engineering: 850,
  Polytechnic: 850,
  Pharmacy: 850,
};
