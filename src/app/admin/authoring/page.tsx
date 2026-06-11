import { loadAuthoringWorkspaceData } from './actions';
import AuthoringWorkspace from './AuthoringWorkspace';

export const dynamic = 'force-dynamic';

export default async function AuthoringPage() {
  const data = await loadAuthoringWorkspaceData();
  return <AuthoringWorkspace initialData={data} />;
}
