
import { useParams } from 'react-router-dom';
import UniversalResourceManager from '../../components/UniversalResourceManager';

const UniversalPage = () => {
    const { entity } = useParams<{ entity: string }>();

    // Fallback or Error if no entity in URL
    if (!entity) return <div>Entidad no especificada</div>;

    // Convert URL param (e.g., 'users') to Config Key (e.g., 'USERS')
    const entityKey = entity.toUpperCase();

    return (
        <div className="container mx-auto max-w-7xl">
            <UniversalResourceManager entityKey={entityKey} />
        </div>
    );
};

export default UniversalPage;
