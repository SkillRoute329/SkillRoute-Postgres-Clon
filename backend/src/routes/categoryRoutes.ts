import { Router } from 'express';
import { getAllCategories, updateCategory, createCategory, deleteCategory, getCategoryHistory, addCategoryPriceHistory } from '../controllers/categoryController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, getAllCategories);
router.post('/', authenticate, createCategory);
router.put('/:id', authenticate, updateCategory);
router.delete('/:id', authenticate, deleteCategory);
router.get('/:id/history', authenticate, getCategoryHistory);
router.post('/:id/history', authenticate, addCategoryPriceHistory);

export default router;
