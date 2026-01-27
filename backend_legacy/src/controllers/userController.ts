import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;

        const users = await prisma.user.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            include: {
                department: true,
                jobRole: true
            }
        });

        res.json(users);
    } catch (error) {
        console.error('User Get Error:', error);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role, departmentId, jobRoleId } = req.body;

    try {
        if (!internalNumber || !firstName || !lastName || !password) {
            return res.status(400).json({ message: 'Campos requeridos' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const tenantId = (req as any).user.tenantId;

        const newUser = await prisma.user.create({
            data: {
                internalNumber: String(internalNumber).trim(),
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                phoneNumber: phoneNumber || null,
                whatsappLink: whatsappLink || null,
                passwordHash,
                role: role || 'User',
                isActive: true,
                tenantId: tenantId,
                departmentId: departmentId ? Number(departmentId) : null,
                jobRoleId: jobRoleId ? Number(jobRoleId) : null
            },
            include: {
                department: true,
                jobRole: true
            }
        });

        res.status(201).json(newUser);
    } catch (error: any) {
        console.error('User Create Error:', error);
        if (error.code === 'P2002') { // Unique constraint
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al crear usuario', details: error.message });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { internalNumber, firstName, lastName, phoneNumber, whatsappLink, password, role, isActive, departmentId, jobRoleId } = req.body;

    try {
        const tenantId = (req as any).user.tenantId;

        const updateData: any = {
            internalNumber: internalNumber ? String(internalNumber).trim() : undefined,
            firstName,
            lastName,
            phoneNumber: phoneNumber || null,
            whatsappLink: whatsappLink || null,
            role,
            isActive,
            departmentId: departmentId ? Number(departmentId) : departmentId === null ? null : undefined, // allow unsetting if explicitly null
            jobRoleId: jobRoleId ? Number(jobRoleId) : jobRoleId === null ? null : undefined
        };

        if (firstName || lastName) {
            if (firstName && lastName) {
                updateData.fullName = `${firstName} ${lastName}`;
            }
        }

        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        // Clean undefined
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

        const updatedUser = await prisma.user.update({
            where: { id: Number(id) },
            data: updateData,
            include: {
                department: true,
                jobRole: true
            }
        });

        res.json(updatedUser);
    } catch (error: any) {
        console.error('User Update Error:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'El número de interno ya existe' });
        }
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const tenantId = (req as any).user.tenantId;

        // Use deleteMany to ensure tenant isolation (delete only supports unique where)
        const result = await prisma.user.deleteMany({
            where: {
                id: Number(id),
                tenantId
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('User Delete Error:', error);
        res.status(500).json({ message: 'Error al eliminar usuario. Verifique que no tenga turnos asociados.' });
    }
};
