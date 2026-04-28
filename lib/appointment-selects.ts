import { Prisma } from "@prisma/client";

export const reportingAppointmentSelect = Prisma.validator<Prisma.AppointmentSelect>()({
  id: true,
  storeId: true,
  appointmentDate: true,
  timeIn: true,
  timeOut: true,
  visitType: true,
  appointmentTypeLabel: true,
  leadSourceLabel: true,
  pricePointLabel: true,
  sizeLabel: true,
  reasonDidNotBuyLabel: true,
  cbAppointmentScheduled: true,
  cbAppointmentAt: true,
  purchased: true,
  otherPurchase: true,
  comments: true,
  customer: {
    select: {
      fullName: true,
      normalizedFullName: true
    }
  },
  assignedStaffMember: {
    select: {
      id: true,
      fullName: true,
      role: true
    }
  },
  location: {
    select: {
      name: true
    }
  }
});

export const dailyLogAppointmentSelect = Prisma.validator<Prisma.AppointmentSelect>()({
  id: true,
  storeId: true,
  appointmentDate: true,
  appointmentTypeOptionId: true,
  appointmentTypeLabel: true,
  visitType: true,
  comments: true,
  leadSourceOptionId: true,
  leadSourceLabel: true,
  pricePointOptionId: true,
  pricePointLabel: true,
  sizeOptionId: true,
  sizeLabel: true,
  purchased: true,
  otherPurchase: true,
  wearDate: true,
  status: true,
  timeIn: true,
  timeOut: true,
  customer: {
    select: {
      fullName: true,
      normalizedFullName: true
    }
  },
  assignedStaffMember: {
    select: {
      id: true,
      fullName: true
    }
  },
  location: {
    select: {
      id: true,
      name: true
    }
  }
});
