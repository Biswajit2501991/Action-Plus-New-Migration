export type Visitor = {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  gender: string;
  status: string;
  callBackRequired: boolean;
  tentativeJoiningDate: string;
  lastCalledAt: string;
  lastCalledBy: string;
  addedAt: string;
  updatedAt?: string;
  convertedAt?: string;
  convertedMemberId?: string;
};

export type VisitorFormValues = {
  id: string;
  fullName: string;
  email: string;
  dob: string;
  mobile: string;
  gender: string;
  callBackRequired: boolean;
  tentativeJoiningDate: string;
  status: string;
  addedAt: string;
};
