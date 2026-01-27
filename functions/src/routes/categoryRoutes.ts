
import { Router } from 'express';
import * as CategoryController from '../controllers/categoryController';

const router = Router();

router.get('/', CategoryController.getCategories);
router.post('/', CategoryController.createCategory);

export default router;
