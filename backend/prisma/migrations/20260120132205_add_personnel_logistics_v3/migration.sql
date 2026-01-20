/*
  Warnings:

  - A unique constraint covering the columns `[internalId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('EFECTIVO_COCHE', 'A_LA_ORDEN', 'A_LA_ORDEN_LISTA', 'LICENCIA_MEDICA', 'VACACIONES');

-- CreateEnum
CREATE TYPE "PersonalRotationScheme" AS ENUM ('ESTANDAR_15x15', 'SEMANAL', 'FIJO_MANANA', 'FIJO_TARDE', 'ROTACION_DE_TRES');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('CORRELATIVO', 'MEDICO', 'CAMBIO_HORARIO', 'PASE_A_LISTA');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "driverStatus" "DriverStatus" NOT NULL DEFAULT 'A_LA_ORDEN',
ADD COLUMN     "fairnessScore" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "internalId" TEXT,
ADD COLUMN     "preferredPartnerId" INTEGER,
ADD COLUMN     "rotationScheme" "PersonalRotationScheme" NOT NULL DEFAULT 'ESTANDAR_15x15';

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "requesterId" INTEGER NOT NULL,
    "type" "RequestType" NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "targetShiftIndex" INTEGER,
    "comments" TEXT,
    "agreedWithPartnerId" INTEGER,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_internalId_key" ON "User"("internalId");

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
