export type CakeConfigOption = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
};

export type CakeTierOption = CakeConfigOption & {
  tierCount: number;
};

export type CakeConfig = {
  flavours: CakeConfigOption[];
  shapes: CakeConfigOption[];
  sizes: CakeConfigOption[];
  toppings: CakeConfigOption[];
  tierOptions: CakeTierOption[];
};

export type CakePrice = {
  id: string;
  flavourId: string;
  shapeId: string;
  sizeId: string;
  tierOptionId: string;
  toppingId: string;
  weightKg: number;
  priceUgx: number;
  sourceNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  flavourCode: string;
  flavourName: string;
  shapeCode: string;
  shapeName: string;
  sizeCode: string;
  sizeName: string;
  tierOptionCode: string;
  tierOptionName: string;
  tierCount: number;
  toppingCode: string;
  toppingName: string;
};

export type CakeSelection = {
  flavourId: string;
  shapeId: string;
  sizeId: string;
  tierOptionId: string;
  toppingId: string;
};

export type CakeReferenceImage = {
  bucket: string;
  path: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

export type CakeCustomRequestPayload = {
  customerName: string;
  phone: string;
  email?: string;
  eventDate: string;
  messageOnCake?: string;
  notes?: string;
  priceId: string;
  flavourId: string;
  shapeId: string;
  sizeId: string;
  tierOptionId: string;
  toppingId: string;
};
