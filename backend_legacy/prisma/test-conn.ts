import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function test() {
    try {
        const categories = await prisma.shiftCategory.findMany();
        console.log('Connection successful! Categories found:', categories.length);
    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
