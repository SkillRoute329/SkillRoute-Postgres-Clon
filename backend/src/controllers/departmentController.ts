import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const departmentController = {
    getAll: async (req: Request, res: Response) => {
        try {
            const departments = await prisma.department.findMany({
                where: { tenantId: 1 }, // Default tenant
                include: { jobRoles: true }, // Include Job Roles
                orderBy: { name: 'asc' }
            });
            res.json(departments);
        } catch (error) {
            console.error('Error fetching departments:', error);
            res.status(500).json({ message: 'Error fetching departments' });
        }
    },

    create: async (req: Request, res: Response) => {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ message: 'Name is required' });
            }

            const department = await prisma.department.create({
                data: {
                    name,
                    description,
                    tenantId: 1
                },
                include: { jobRoles: true }
            });
            res.status(201).json(department);
        } catch (error) {
            console.error('Error creating department:', error);
            res.status(500).json({ message: 'Error creating department' });
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            const department = await prisma.department.update({
                where: { id: Number(id) },
                data: { name, description },
                include: { jobRoles: true }
            });
            res.json(department);
        } catch (error) {
            console.error('Error updating department:', error);
            res.status(500).json({ message: 'Error updating department' });
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            // First delete job roles associated with this department?
            // Or let Cascade delete handle it if configured (Prisma default is restrictive usually)
            // Ideally we should check for users first.

            await prisma.jobRole.deleteMany({ where: { departmentId: Number(id) } });

            await prisma.department.delete({
                where: { id: Number(id) }
            });
            res.json({ message: 'Department deleted' });
        } catch (error) {
            console.error('Error deleting department:', error);
            res.status(500).json({ message: 'Error deleting department' });
        }
    },

    // Job Role Management
    addJobRole: async (req: Request, res: Response) => {
        try {
            const { id } = req.params; // Department ID
            const { name, description, baseSalary, extraHourValue } = req.body;

            const jobRole = await prisma.jobRole.create({
                data: {
                    name,
                    description,
                    baseSalary: baseSalary ? Number(baseSalary) : 0,
                    extraHourValue: extraHourValue ? Number(extraHourValue) : 0,
                    departmentId: Number(id),
                    tenantId: 1
                }
            });
            res.status(201).json(jobRole);
        } catch (error) {
            console.error('Error adding job role:', error);
            res.status(500).json({ message: 'Error adding job role' });
        }
    },

    deleteJobRole: async (req: Request, res: Response) => {
        try {
            const { roleId } = req.params;
            await prisma.jobRole.delete({
                where: { id: Number(roleId) }
            });
            res.json({ message: 'Job role deleted' });
        } catch (error) {
            console.error('Error deleting job role:', error);
            res.status(500).json({ message: 'Error deleting job role' });
        }
    }
};
