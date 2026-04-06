-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'STYLIST', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('STYLIST', 'SEAMSTRESS');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('APPOINTMENT', 'WALK_IN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreOptionKind" AS ENUM ('APPOINTMENT_TYPE', 'WALK_IN_TYPE', 'LEAD_SOURCE', 'PRICE_POINT', 'SIZE', 'REASON_DID_NOT_BUY');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT,
    "staffMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedFullName" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedFullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreOption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" "StoreOptionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedStaffMemberId" TEXT,
    "locationId" TEXT,
    "appointmentDate" DATE NOT NULL,
    "timeIn" TIMESTAMP(3) NOT NULL,
    "timeOut" TIMESTAMP(3),
    "wearDate" DATE,
    "visitType" "VisitType" NOT NULL,
    "appointmentTypeOptionId" TEXT,
    "appointmentTypeLabel" TEXT NOT NULL,
    "leadSourceOptionId" TEXT,
    "leadSourceLabel" TEXT,
    "pricePointOptionId" TEXT,
    "pricePointLabel" TEXT,
    "sizeOptionId" TEXT,
    "sizeLabel" TEXT,
    "reasonDidNotBuyOptionId" TEXT,
    "reasonDidNotBuyLabel" TEXT,
    "cbAppointmentScheduled" BOOLEAN NOT NULL DEFAULT false,
    "cbAppointmentAt" TIMESTAMP(3),
    "purchased" BOOLEAN,
    "otherPurchase" BOOLEAN,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "comments" TEXT,
    "managerApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "createdByUserId" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_staffMemberId_key" ON "User"("staffMemberId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_storeId_role_idx" ON "User"("storeId", "role");

-- CreateIndex
CREATE INDEX "StaffMember_storeId_role_isActive_idx" ON "StaffMember"("storeId", "role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_storeId_role_normalizedFullName_key" ON "StaffMember"("storeId", "role", "normalizedFullName");

-- CreateIndex
CREATE INDEX "Location_storeId_isActive_idx" ON "Location"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Location_storeId_normalizedName_key" ON "Location"("storeId", "normalizedName");

-- CreateIndex
CREATE INDEX "Customer_storeId_normalizedFullName_idx" ON "Customer"("storeId", "normalizedFullName");

-- CreateIndex
CREATE INDEX "Customer_storeId_createdAt_idx" ON "Customer"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreOption_storeId_kind_isActive_sortOrder_idx" ON "StoreOption"("storeId", "kind", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StoreOption_storeId_kind_normalizedLabel_key" ON "StoreOption"("storeId", "kind", "normalizedLabel");

-- CreateIndex
CREATE INDEX "Appointment_storeId_appointmentDate_idx" ON "Appointment"("storeId", "appointmentDate");

-- CreateIndex
CREATE INDEX "Appointment_storeId_status_idx" ON "Appointment"("storeId", "status");

-- CreateIndex
CREATE INDEX "Appointment_storeId_visitType_appointmentDate_idx" ON "Appointment"("storeId", "visitType", "appointmentDate");

-- CreateIndex
CREATE INDEX "Appointment_assignedStaffMemberId_appointmentDate_idx" ON "Appointment"("assignedStaffMemberId", "appointmentDate");

-- CreateIndex
CREATE INDEX "Appointment_customerId_appointmentDate_idx" ON "Appointment"("customerId", "appointmentDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreOption" ADD CONSTRAINT "StoreOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedStaffMemberId_fkey" FOREIGN KEY ("assignedStaffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeOptionId_fkey" FOREIGN KEY ("appointmentTypeOptionId") REFERENCES "StoreOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadSourceOptionId_fkey" FOREIGN KEY ("leadSourceOptionId") REFERENCES "StoreOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_pricePointOptionId_fkey" FOREIGN KEY ("pricePointOptionId") REFERENCES "StoreOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_sizeOptionId_fkey" FOREIGN KEY ("sizeOptionId") REFERENCES "StoreOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_reasonDidNotBuyOptionId_fkey" FOREIGN KEY ("reasonDidNotBuyOptionId") REFERENCES "StoreOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
