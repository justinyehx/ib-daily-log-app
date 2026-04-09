export type BridalLiveAuthRequest = {
  apiKey: string;
  retailerId: string;
  employeeId?: number;
  hash?: string;
};

export type BridalLiveAuthResult = {
  token: string;
  expires: string;
  employee?: {
    id?: number;
    employeeFullName?: string;
  };
};

export type BridalLiveListResult<T> = {
  page: number;
  result: T[];
  size: number;
  sortDirection: string;
  sortField: string;
  total: number;
};

export type BridalLiveAppointmentRecord = {
  id: number;
  contactId?: number;
  contactName?: string;
  contact?: {
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    mobilePhoneNumber?: string;
  };
  bestPhoneNumber?: string;
  mobilePhoneNumber?: string;
  email?: string;
  emailAddress?: string;
  startDateTime?: string;
  endDateTime?: string;
  typeDescription?: string;
  appointmentType?: {
    description?: string;
    name?: string;
  };
  employeeId?: number;
  employeeName?: string;
  employee?: {
    employeeFullName?: string;
  };
  fittingRoomDescription?: string;
  howHeardDescription?: string;
  notes?: string;
  checkedIn?: boolean;
  confirmed?: boolean;
  status?: string;
  contactEventDate?: string;
  eventDateStr?: string;
};

export type BridalLiveEmployeeRecord = {
  id: number;
  employeeFullName?: string;
  firstName?: string;
  lastName?: string;
  retailerId?: string;
};
