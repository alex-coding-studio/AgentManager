export function actionPublicationBranch(cardBranch: string, actionId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(actionId))
    throw new Error('Invalid publication Action identity.');
  return `${cardBranch}--action-${actionId}`;
}
