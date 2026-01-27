
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
    console.log("🔐 INICIANDO ROTACIÓN DE CREDENCIALES...");

    try {
        const adminEmail = 'admin@transformafacil.com';
        const user = await prisma.user.findFirst({
            where: { email: adminEmail }
        });

        if (user) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: hashedPassword }
            });
            console.log(`✅ Contraseña actualizada a 'admin123' para el usuario ID ${user.id}.`);
            console.log("   -> El usuario NO fue borrado, solo actualizado.");
        } else {
            console.log("⚠️ No se encontró el usuario admin para actualizar.");
        }
    } catch (e) {
        console.error("❌ Error al actualizar contraseña:", e);
    } finally {
        await prisma.$disconnect();
    }
}

resetAdminPassword();
