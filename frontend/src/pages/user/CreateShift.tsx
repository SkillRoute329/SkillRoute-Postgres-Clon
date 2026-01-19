import { useState, useEffect, useMemo, useRef } from 'react';
import { ShiftService } from '../../services/api';
import { Check, AlertCircle, Wallet, CreditCard } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../utils/auth';

const CreateShift = () => {
    const navigate = useNavigate();
    const currentUser = getCurrentUser();
    const [categories, setCategories] = useState<any[]>([]);
    const [systemDiscount, setSystemDiscount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs for Auto-Focus
    const dateRef = useRef<HTMLInputElement>(null);
    const timeRef = useRef<HTMLInputElement>(null);
    const endTimeRef = useRef<HTMLInputElement>(null);
    const serviceNumberRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        categoryId: 0,
        serviceNumber: '',
        date: new Date().toISOString().split('T')[0], // Default to today
        time: '',
        endTime: '',
        line: '',
        relief: '',
        carNumber: '',
        extraHours: 0,
        tip: false,
        tipValue: 0,
        transformaFacil: false
    });

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = await ShiftService.getSystemConfig();
                if (config && config.TRANSFORMA_FACIL_DISCOUNT) {
                    setSystemDiscount(Number(config.TRANSFORMA_FACIL_DISCOUNT));
                }
            } catch (err) {
                console.error('Error loading config:', err);
            }
        };
        loadConfig();
    }, []);

    // Re-fetch categories when date changes to get correct historical/future pricing
    useEffect(() => {
        const loadCategories = async () => {
            // Only set loading on first load or if you want to block UI on date change
            // setIsLoading(true); 
            try {
                const cats = await ShiftService.getCategories(formData.date);
                if (Array.isArray(cats)) {
                    setCategories(cats);
                } else {
                    console.warn('Invalid categories response:', cats);
                    setCategories([]); // Fallback to empty array to prevent map crash
                }
            } catch (err) {
                console.error('Error loading categories:', err);
                setError('No se pudieron cargar las categorías.');
                setCategories([]); // Ensure it's an array
            } finally {
                setIsLoading(false);
            }
        };
        loadCategories();
    }, [formData.date]);

    const selectedCategory = categories.find(c => Number(c.id) === Number(formData.categoryId));

    const priceBreakdown = useMemo(() => {
        if (!selectedCategory) return { base: 0, extras: 0, tip: 0, discount: 0, total: 0 };

        const base = Number(selectedCategory.effectiveBaseValue ?? selectedCategory.baseValue) || 0;

        const extraHourRate = Number(selectedCategory.effectiveExtraHourValue ?? selectedCategory.extraHourValue) || 0;
        const extraHoursQty = Number(formData.extraHours) || 0;
        let extras = 0;
        if (extraHourRate > 0 && extraHoursQty > 0) {
            extras = extraHoursQty * extraHourRate;
        }

        let tip = 0;
        if (formData.tip) {
            tip = Number(formData.tipValue) || 0;
        }

        let discount = 0;
        if (formData.transformaFacil) {
            discount = systemDiscount;
        }

        const subtotal = base + extras + tip;
        // Total cannot be less than 0
        const total = Math.max(0, subtotal - discount);

        return {
            base,
            extras,
            tip,
            discount,
            total
        };
    }, [selectedCategory, formData.extraHours, formData.tip, formData.tipValue, formData.transformaFacil, systemDiscount]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            if (!formData.categoryId) {
                throw new Error('Debe seleccionar una categoría.');
            }

            // Sanitize data before sending
            const shiftData = {
                ...formData,
                categoryId: Number(formData.categoryId),
                extraHours: Number(formData.extraHours) || 0,
                tipValue: Number(formData.tipValue) || 0,
                totalValue: priceBreakdown.total,
            };

            const result = await ShiftService.create(shiftData);

            if (result.id) {
                setIsSuccess(true);
                // Force reload to avoid white screen issues
                setTimeout(() => {
                    window.location.href = '/dashboard/my-shifts';
                }, 1000); // 1 second delay to see the success message
            } else {
                throw new Error('No se recibió ID del turno creado');
            }
        } catch (err) {
            console.error('Error creating shift:', err);
            setError(`Error: ${(err as Error).message} `);
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked
            : type === 'number' ? Number(value)
                : value;

        setFormData(prev => ({
            ...prev,
            [name]: val
        }));

        // Auto-Focus Logic
        if (value) { // Only if value is present/valid
            if (name === 'date') {
                timeRef.current?.focus();
            } else if (name === 'time') {
                endTimeRef.current?.focus();
            } else if (name === 'endTime') {
                serviceNumberRef.current?.focus();
            }
        }
    };

    // Auto-focus Date when Category is selected
    const handleCategorySelect = (id: number) => {
        setFormData(prev => ({ ...prev, categoryId: id }));
        // Small timeout to allow state update/rendering if needed, though robust enough directly usually
        setTimeout(() => {
            dateRef.current?.showPicker ? dateRef.current?.showPicker() : dateRef.current?.focus();
        }, 100);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-96 animate-fade-in-up">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 mb-6 animate-bounce-slow">
                    <Check className="w-12 h-12 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">¡Turno Creado!</h2>
                <p className="text-slate-400">Redirigiendo a tus turnos...</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in-up">
            <h1 className="text-2xl font-bold text-white mb-6">Ofrecer un Nuevo Turno</h1>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-500">
                    <AlertCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-2xl border border-slate-700 space-y-6">

                {/* Admin Only: Ceding User Override */}
                {currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin' ? (
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mb-6">
                        <label className="text-sm font-bold text-yellow-400 block mb-2">
                            <span>(Admin) ¿Quién cede el turno?</span>
                        </label>
                        <input
                            name="cedingInternalNumber"
                            type="text"
                            placeholder="Ingrese N° Interno (Dejar vacío si es propio)"
                            onChange={handleChange}
                            className="input-field bg-slate-900 border-yellow-500/30 text-white w-full placeholder:text-slate-600"
                        />
                        <p className="text-xs text-slate-500 mt-1"><span>Si ingresa un interno, el turno se registrará como creado por ese usuario (para balance).</span></p>
                    </div>
                ) : null}

                {/* Category Selection */}
                <div>
                    <label className="text-sm font-medium text-slate-300 mb-2 block"><span>Categoría del Turno</span></label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => handleCategorySelect(Number(cat.id))}
                                className={clsx(
                                    "p-3 rounded-xl border text-left transition-all",
                                    Number(formData.categoryId) === Number(cat.id)
                                        ? "bg-primary-600/20 border-primary-500 text-white shadow-lg shadow-primary-900/20"
                                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                                )}
                            >
                                <div className="font-semibold text-sm"><span>{cat.name}</span></div>
                                <div className="text-xs mt-1 opacity-70">
                                    <span>$</span><span>{Number(cat.baseValue).toLocaleString()}</span>
                                    {Number(cat.extraHourValue) > 0 && (
                                        <span>
                                            <span> + </span>
                                            <span>{Number(cat.extraHourValue)}</span>
                                            <span>/h</span>
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-slate-300 block mb-2">
                                <span>Fecha </span>
                                <span className="text-red-400">*</span>
                            </label>
                            <input
                                ref={dateRef}
                                name="date"
                                type="date"
                                required
                                value={formData.date}
                                onChange={handleChange}
                                className="input-field bg-slate-900 border-slate-700 text-white w-full"
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-sm font-medium text-slate-300 block mb-2">
                                <span>Inicio </span>
                                <span className="text-red-400">*</span>
                            </label>
                            <input
                                ref={timeRef}
                                name="time"
                                type="time"
                                required
                                value={formData.time}
                                onChange={handleChange}
                                className="input-field bg-slate-900 border-slate-700 text-white w-full"
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-sm font-medium text-slate-300 block mb-2">
                                <span>Hora Fin </span>
                                <span className="text-red-400">*</span>
                            </label>
                            <input
                                ref={endTimeRef}
                                name="endTime"
                                type="time"
                                required
                                value={formData.endTime || ''}
                                onChange={handleChange}
                                className="input-field bg-slate-900 border-slate-700 text-white w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2"><span>N° Servicio</span></label>
                        <input
                            ref={serviceNumberRef}
                            name="serviceNumber"
                            type="text"
                            required
                            onChange={handleChange}
                            placeholder="Ej. 105"
                            className="input-field bg-slate-900 border-slate-700 text-white"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2"><span>Línea y Coche</span></label>
                        <div className="flex gap-2">
                            <input name="line" type="text" required onChange={handleChange} placeholder="Línea" className="input-field bg-slate-900 border-slate-700 text-white" />
                            <input name="carNumber" type="text" required onChange={handleChange} placeholder="Coche" className="input-field bg-slate-900 border-slate-700 text-white" />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2"><span>Relevo (Opcional)</span></label>
                        <input name="relief" type="text" onChange={handleChange} className="input-field bg-slate-900 border-slate-700 text-white" />
                    </div>
                </div>

                {/* Extras Section */}
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2"><span>Horas Extras</span></label>
                        <div className="flex items-center gap-4">
                            <input
                                name="extraHours"
                                type="number"
                                min="0"
                                step="0.5"
                                value={formData.extraHours || ''}
                                onChange={handleChange}
                                className="input-field bg-slate-900 border-slate-700 text-white w-32"
                            />
                            <div className="min-h-[1.5em]"> {/* Stable container for calculation */}
                                {selectedCategory && Number(selectedCategory.extraHourValue) > 0 && (
                                    <span className="text-sm text-slate-400">
                                        <span> x $</span>
                                        <span>{Number(selectedCategory.extraHourValue)}</span>
                                        <span> = </span>
                                        <span className="text-white font-bold">
                                            <span>$</span>
                                            <span>{(Number(formData.extraHours) * Number(selectedCategory.extraHourValue)).toLocaleString()}</span>
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 pt-2">
                        <div className="flex items-center h-5">
                            <input
                                id="tip"
                                name="tip"
                                type="checkbox"
                                checked={formData.tip}
                                onChange={handleChange}
                                className="w-4 h-4 bg-slate-900 border-slate-600 rounded focus:ring-primary-500 text-primary-600"
                            />
                        </div>
                        <div className="flex-1">
                            <label htmlFor="tip" className="font-medium text-white text-sm"><span>Incluir Propina</span></label>
                            <p className="text-xs text-slate-400"><span>Si activas esto, se sumará al valor total.</span></p>

                            {formData.tip && (
                                <input
                                    name="tipValue"
                                    type="number"
                                    placeholder="Valor propina $"
                                    value={formData.tipValue || ''}
                                    onChange={handleChange}
                                    className="mt-2 input-field bg-slate-900 border-slate-700 text-white w-full md:w-1/2"
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Payment Method Section (New TransForma- UI) */}
                <div>
                    <label className="text-sm font-medium text-slate-300 block mb-3"><span>Método de Cobro</span></label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Option 1: Direct Payment */}
                        <div
                            onClick={() => setFormData(prev => ({ ...prev, transformaFacil: false }))}
                            className={clsx(
                                "cursor-pointer p-4 rounded-xl border-2 transition-all relative overflow-hidden",
                                !formData.transformaFacil
                                    ? "bg-emerald-900/20 border-emerald-500/50"
                                    : "bg-slate-800/30 border-slate-700 hover:border-slate-600"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div className={clsx(
                                    "p-3 rounded-full",
                                    !formData.transformaFacil ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-400"
                                )}>
                                    <Wallet className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className={clsx("font-bold text-sm mb-1", !formData.transformaFacil ? "text-white" : "text-slate-300")}>
                                        <span>Pago Directo</span>
                                    </h3>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        <span>Cobras el total en efectivo/transferencia al conductor.</span>
                                    </p>
                                </div>
                            </div>
                            {!formData.transformaFacil && (
                                <div className="absolute top-3 right-3">
                                    <Check className="w-5 h-5 text-emerald-500" />
                                </div>
                            )}
                        </div>

                        {/* Option 2: A Canje */}
                        <div
                            onClick={() => setFormData(prev => ({ ...prev, transformaFacil: true }))}
                            className={clsx(
                                "cursor-pointer p-4 rounded-xl border-2 transition-all relative overflow-hidden",
                                formData.transformaFacil
                                    ? "bg-amber-900/20 border-amber-500/50"
                                    : "bg-slate-800/30 border-slate-700 hover:border-slate-600"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div className={clsx(
                                    "p-3 rounded-full",
                                    formData.transformaFacil ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400"
                                )}>
                                    <CreditCard className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className={clsx("font-bold text-sm mb-1", formData.transformaFacil ? "text-white" : "text-slate-300")}>
                                        <span>A Canje</span>
                                    </h3>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        <span>Turno extra realizado "a favor". Se suma a tu balance para cubrir futuras ausencias.</span>
                                    </p>
                                </div>
                            </div>
                            {formData.transformaFacil && (
                                <div className="absolute top-3 right-3">
                                    <Check className="w-5 h-5 text-amber-500" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Total Estimate */}
                <div className="bg-gradient-to-r from-primary-900/40 to-slate-900/40 border border-primary-500/30 p-5 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-xs uppercase font-bold tracking-wider"><span>Desglose del Valor</span></span>
                    </div>

                    <div className="space-y-1 mb-3 text-sm">
                        <div className="flex justify-between text-slate-300">
                            <span>
                                <span>Base (</span>
                                <span>{selectedCategory?.name}</span>
                                <span>)</span>
                            </span>
                            <span className="font-medium">
                                <span>$</span>
                                <span>{priceBreakdown.base.toLocaleString()}</span>
                            </span>
                        </div>
                        {priceBreakdown.extras > 0 && (
                            <div className="flex justify-between text-yellow-300/90">
                                <span><span>+ Horas Extras</span></span>
                                <span className="font-medium">
                                    <span>$</span>
                                    <span>{priceBreakdown.extras.toLocaleString()}</span>
                                </span>
                            </div>
                        )}
                        {priceBreakdown.tip > 0 && (
                            <div className="flex justify-between text-emerald-300/90">
                                <span><span>+ Propina</span></span>
                                <span className="font-medium">
                                    <span>$</span>
                                    <span>{priceBreakdown.tip.toLocaleString()}</span>
                                </span>
                            </div>
                        )}
                        <div className="min-h-[1.5em]"> {/* Stable container for discount */}
                            {priceBreakdown.discount > 0 && (
                                <div className="flex justify-between text-red-300/90">
                                    <span><span>- Tarifa Servicio</span></span>
                                    <span className="font-medium">
                                        <span>-$</span>
                                        <span>{priceBreakdown.discount.toLocaleString()}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-slate-700/50 my-2"></div>

                    <div className="flex items-center justify-between">
                        <span className="text-primary-200 font-bold"><span>Total a Recibir</span></span>
                        <span className="text-3xl font-black text-white tracking-tight">
                            <span>$</span>
                            <span>{priceBreakdown.total.toLocaleString()}</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                    <button type="button" className="px-6 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors" onClick={() => navigate(-1)}>
                        <span>Cancelar</span>
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-primary-600 hover:bg-primary-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary-900/50 transition-all flex items-center justify-center gap-2"
                    >
                        <span>{isSubmitting ? 'Guardando...' : 'Crear Turno'}</span>
                        <Check className="w-5 h-5" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateShift;
