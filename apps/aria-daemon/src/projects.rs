use anyhow::{anyhow, Context, Result};
use aria_ipc::{
    CreateProjectRequest, ProjectPane, ProjectPaneNode, ProjectSelector, ProjectSummary,
    ProjectTabKind, ProjectWorkspace, ReorderProjectsRequest, RenameProjectRequest,
    UpdateProjectLayoutRequest,
};
use aria_model::{PaneId, ProjectId, SessionId};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tokio::sync::RwLock;

const DEFAULT_PROJECT_NAME: &str = "Default Project";
const MIN_SPLIT_RATIO: f32 = 0.15;
const MAX_SPLIT_RATIO: f32 = 0.85;

pub struct ProjectStore {
    path: PathBuf,
    workspace: RwLock<ProjectWorkspace>,
}

impl ProjectStore {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let workspace = load_workspace_file(&path).unwrap_or_else(|_| default_workspace());

        Ok(Self {
            path,
            workspace: RwLock::new(reconcile_workspace(workspace)),
        })
    }

    pub async fn get(&self) -> ProjectWorkspace {
        self.workspace.read().await.clone()
    }

    pub async fn create(&self, name: String) -> Result<ProjectSummary> {
        let mut workspace = self.workspace.write().await;
        let project = default_project(clean_project_name(name));
        workspace.active_project_id = project.project_id;
        workspace.projects.push(project.clone());
        save_workspace_file(&self.path, &workspace)?;
        Ok(project)
    }

    pub async fn create_from_request(
        &self,
        request: CreateProjectRequest,
    ) -> Result<ProjectSummary> {
        self.create(request.name).await
    }

    pub async fn rename(&self, request: RenameProjectRequest) -> Result<ProjectWorkspace> {
        let mut workspace = self.workspace.write().await;
        let project = workspace
            .projects
            .iter_mut()
            .find(|project| project.project_id == request.project_id)
            .ok_or_else(|| anyhow!("project not found"))?;
        project.name = clean_project_name(request.name);
        save_workspace_file(&self.path, &workspace)?;
        Ok(workspace.clone())
    }

    pub async fn delete(&self, project_id: ProjectId) -> Result<ProjectWorkspace> {
        let mut workspace = self.workspace.write().await;
        if workspace.projects.len() <= 1 {
            return Err(anyhow!("cannot delete the only project"));
        }

        let project = workspace
            .projects
            .iter()
            .find(|project| project.project_id == project_id)
            .ok_or_else(|| anyhow!("project not found"))?;
        if !project_is_empty(project) {
            return Err(anyhow!("cannot delete a project that still has tabs"));
        }

        workspace
            .projects
            .retain(|project| project.project_id != project_id);
        if workspace.active_project_id == project_id {
            workspace.active_project_id = workspace
                .projects
                .first()
                .map(|project| project.project_id)
                .ok_or_else(|| anyhow!("workspace has no projects"))?;
        }
        save_workspace_file(&self.path, &workspace)?;
        Ok(workspace.clone())
    }

    pub async fn delete_from_request(&self, request: ProjectSelector) -> Result<ProjectWorkspace> {
        self.delete(request.project_id).await
    }

    pub async fn activate(&self, request: ProjectSelector) -> Result<ProjectWorkspace> {
        let mut workspace = self.workspace.write().await;
        if !workspace
            .projects
            .iter()
            .any(|project| project.project_id == request.project_id)
        {
            return Err(anyhow!("project not found"));
        }
        workspace.active_project_id = request.project_id;
        save_workspace_file(&self.path, &workspace)?;
        Ok(workspace.clone())
    }

    pub async fn update_layout(
        &self,
        request: UpdateProjectLayoutRequest,
    ) -> Result<ProjectWorkspace> {
        let mut workspace = self.workspace.write().await;
        let project = workspace
            .projects
            .iter_mut()
            .find(|project| project.project_id == request.project_id)
            .ok_or_else(|| anyhow!("project not found"))?;
        project.active_pane_id = request.active_pane_id;
        project.layout = reconcile_pane_node(request.layout);
        save_workspace_file(&self.path, &workspace)?;
        Ok(workspace.clone())
    }

    pub async fn reorder(&self, request: ReorderProjectsRequest) -> Result<ProjectWorkspace> {
        let mut workspace = self.workspace.write().await;
        if request.project_ids.len() != workspace.projects.len() {
            return Err(anyhow!("project id count mismatch"));
        }

        let mut reordered = Vec::with_capacity(request.project_ids.len());
        for project_id in &request.project_ids {
            let project = workspace
                .projects
                .iter()
                .find(|project| project.project_id == *project_id)
                .ok_or_else(|| anyhow!("project not found: {project_id}"))?;
            reordered.push(project.clone());
        }

        workspace.projects = reordered;
        save_workspace_file(&self.path, &workspace)?;
        Ok(workspace.clone())
    }

    pub async fn has_session_reference(&self, session_id: SessionId) -> bool {
        let workspace = self.workspace.read().await;
        workspace
            .projects
            .iter()
            .any(|project| pane_node_has_session_reference(&project.layout, session_id))
    }
}

fn load_workspace_file(path: &Path) -> Result<ProjectWorkspace> {
    if !path.exists() {
        return Ok(default_workspace());
    }

    let contents = fs::read_to_string(path)
        .with_context(|| format!("read project layout file {}", path.display()))?;
    toml::from_str(&contents)
        .with_context(|| format!("parse project layout file {}", path.display()))
}

fn save_workspace_file(path: &Path, workspace: &ProjectWorkspace) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create project layout directory {}", parent.display()))?;
    }
    let contents = toml::to_string_pretty(workspace).context("serialize project layout")?;
    fs::write(path, contents)
        .with_context(|| format!("write project layout file {}", path.display()))
}

fn default_workspace() -> ProjectWorkspace {
    let project = default_project(DEFAULT_PROJECT_NAME.to_string());
    ProjectWorkspace {
        active_project_id: project.project_id,
        projects: vec![project],
    }
}

fn default_project(name: String) -> ProjectSummary {
    let pane_id = PaneId::new();
    ProjectSummary {
        project_id: ProjectId::new(),
        name,
        active_pane_id: pane_id,
        layout: ProjectPaneNode::Leaf(ProjectPane {
            pane_id,
            active_tab_id: None,
            tabs: Vec::new(),
        }),
    }
}

fn reconcile_workspace(mut workspace: ProjectWorkspace) -> ProjectWorkspace {
    if workspace.projects.is_empty() {
        return default_workspace();
    }

    for project in &mut workspace.projects {
        project.name = clean_project_name(project.name.clone());
        project.layout = reconcile_pane_node(project.layout.clone());
        if !pane_exists(&project.layout, project.active_pane_id) {
            project.active_pane_id = first_pane_id(&project.layout);
        }
    }

    if !workspace
        .projects
        .iter()
        .any(|project| project.project_id == workspace.active_project_id)
    {
        workspace.active_project_id = workspace.projects[0].project_id;
    }

    workspace
}

fn reconcile_pane_node(node: ProjectPaneNode) -> ProjectPaneNode {
    match node {
        ProjectPaneNode::Leaf(mut pane) => {
            if !pane
                .active_tab_id
                .is_some_and(|active| pane.tabs.iter().any(|tab| tab.tab_id == active))
            {
                pane.active_tab_id = pane.tabs.first().map(|tab| tab.tab_id);
            }
            ProjectPaneNode::Leaf(pane)
        }
        ProjectPaneNode::Split {
            split_id,
            direction,
            ratio,
            first,
            second,
        } => ProjectPaneNode::Split {
            split_id,
            direction,
            ratio: ratio.clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO),
            first: Box::new(reconcile_pane_node(*first)),
            second: Box::new(reconcile_pane_node(*second)),
        },
    }
}

fn pane_exists(node: &ProjectPaneNode, pane_id: PaneId) -> bool {
    match node {
        ProjectPaneNode::Leaf(pane) => pane.pane_id == pane_id,
        ProjectPaneNode::Split { first, second, .. } => {
            pane_exists(first, pane_id) || pane_exists(second, pane_id)
        }
    }
}

fn first_pane_id(node: &ProjectPaneNode) -> PaneId {
    match node {
        ProjectPaneNode::Leaf(pane) => pane.pane_id,
        ProjectPaneNode::Split { first, .. } => first_pane_id(first),
    }
}

fn project_is_empty(project: &ProjectSummary) -> bool {
    pane_tab_count(&project.layout) == 0
}

fn pane_tab_count(node: &ProjectPaneNode) -> usize {
    match node {
        ProjectPaneNode::Leaf(pane) => pane.tabs.len(),
        ProjectPaneNode::Split { first, second, .. } => {
            pane_tab_count(first) + pane_tab_count(second)
        }
    }
}

fn pane_node_has_session_reference(node: &ProjectPaneNode, session_id: SessionId) -> bool {
    match node {
        ProjectPaneNode::Leaf(pane) => pane
            .tabs
            .iter()
            .any(|tab| tab.kind == ProjectTabKind::Terminal && tab.session_id == Some(session_id)),
        ProjectPaneNode::Split { first, second, .. } => {
            pane_node_has_session_reference(first, session_id)
                || pane_node_has_session_reference(second, session_id)
        }
    }
}

fn clean_project_name(name: String) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        DEFAULT_PROJECT_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::ProjectStore;
    use aria_ipc::{
        HtmlPageId, ProjectPane, ProjectPaneNode, ProjectTab, ProjectTabKind,
        UpdateProjectLayoutRequest,
    };
    use aria_model::{PaneId, ProjectTabId, SessionId};
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[tokio::test]
    async fn project_store_creates_default_workspace() {
        let path = temp_projects_path("default");
        let store = ProjectStore::load(&path).expect("load store");

        let workspace = store.get().await;

        assert_eq!(workspace.projects.len(), 1);
        assert_eq!(
            workspace.projects[0].project_id,
            workspace.active_project_id
        );
        assert!(matches!(
            workspace.projects[0].layout,
            ProjectPaneNode::Leaf(_)
        ));
        remove_temp_projects(&path);
    }

    #[tokio::test]
    async fn project_store_round_trips_layout_and_preserves_missing_sessions() {
        let path = temp_projects_path("round-trip");
        let store = ProjectStore::load(&path).expect("load store");
        let workspace = store.get().await;
        let project_id = workspace.active_project_id;
        let pane_id = PaneId::new();
        let tab_id = ProjectTabId::new();
        let missing_session_id = SessionId::new();

        store
            .update_layout(UpdateProjectLayoutRequest {
                project_id,
                active_pane_id: pane_id,
                close_session_if_unused: None,
                layout: ProjectPaneNode::Leaf(ProjectPane {
                    pane_id,
                    active_tab_id: Some(tab_id),
                    tabs: vec![ProjectTab {
                        kind: ProjectTabKind::Terminal,
                        page_id: None,
                        tab_id,
                        title: "Old Shell".to_string(),
                        session_id: Some(missing_session_id),
                    }],
                }),
            })
            .await
            .expect("update layout");

        let reloaded = ProjectStore::load(&path).expect("reload store").get().await;
        let ProjectPaneNode::Leaf(pane) = &reloaded.projects[0].layout else {
            panic!("expected leaf pane");
        };

        assert_eq!(pane.tabs[0].session_id, Some(missing_session_id));
        remove_temp_projects(&path);
    }

    #[tokio::test]
    async fn project_store_round_trips_html_tabs() {
        let path = temp_projects_path("html-round-trip");
        let store = ProjectStore::load(&path).expect("load store");
        let workspace = store.get().await;
        let project_id = workspace.active_project_id;
        let pane_id = PaneId::new();
        let tab_id = ProjectTabId::new();

        store
            .update_layout(UpdateProjectLayoutRequest {
                project_id,
                active_pane_id: pane_id,
                close_session_if_unused: None,
                layout: ProjectPaneNode::Leaf(ProjectPane {
                    pane_id,
                    active_tab_id: Some(tab_id),
                    tabs: vec![ProjectTab {
                        kind: ProjectTabKind::Html,
                        page_id: Some(HtmlPageId::Settings),
                        tab_id,
                        title: "Settings".to_string(),
                        session_id: None,
                    }],
                }),
            })
            .await
            .expect("update layout");

        let reloaded = ProjectStore::load(&path).expect("reload store").get().await;
        let ProjectPaneNode::Leaf(pane) = &reloaded.projects[0].layout else {
            panic!("expected leaf pane");
        };

        assert_eq!(pane.tabs[0].kind, ProjectTabKind::Html);
        assert_eq!(pane.tabs[0].page_id, Some(HtmlPageId::Settings));
        assert_eq!(pane.tabs[0].session_id, None);
        remove_temp_projects(&path);
    }

    #[tokio::test]
    async fn project_store_deletes_only_empty_projects() {
        let path = temp_projects_path("delete");
        let store = ProjectStore::load(&path).expect("load store");
        let created = store
            .create("Scratch".to_string())
            .await
            .expect("create project");

        store
            .delete(created.project_id)
            .await
            .expect("delete empty project");

        let workspace = store.get().await;
        assert!(workspace
            .projects
            .iter()
            .all(|project| project.project_id != created.project_id));
        remove_temp_projects(&path);
    }

    #[tokio::test]
    async fn project_store_detects_session_references_across_all_projects() {
        let path = temp_projects_path("references");
        let store = ProjectStore::load(&path).expect("load store");
        let workspace = store.get().await;
        let first_project_id = workspace.active_project_id;
        let referenced_session_id = SessionId::new();
        let html_only_session_id = SessionId::new();
        let missing_session_id = SessionId::new();
        let pane_a = PaneId::new();
        let pane_b = PaneId::new();

        store
            .create("Second".to_string())
            .await
            .expect("create project");
        let second_project_id = store
            .get()
            .await
            .projects
            .iter()
            .find(|project| project.project_id != first_project_id)
            .expect("second project")
            .project_id;

        store
            .update_layout(UpdateProjectLayoutRequest {
                project_id: first_project_id,
                active_pane_id: pane_a,
                close_session_if_unused: None,
                layout: ProjectPaneNode::Leaf(ProjectPane {
                    pane_id: pane_a,
                    active_tab_id: Some(ProjectTabId::new()),
                    tabs: vec![ProjectTab {
                        kind: ProjectTabKind::Html,
                        page_id: Some(HtmlPageId::Settings),
                        tab_id: ProjectTabId::new(),
                        title: "Settings".to_string(),
                        session_id: Some(html_only_session_id),
                    }],
                }),
            })
            .await
            .expect("update first project");

        store
            .update_layout(UpdateProjectLayoutRequest {
                project_id: second_project_id,
                active_pane_id: pane_b,
                close_session_if_unused: None,
                layout: ProjectPaneNode::Leaf(ProjectPane {
                    pane_id: pane_b,
                    active_tab_id: Some(ProjectTabId::new()),
                    tabs: vec![
                        ProjectTab {
                            kind: ProjectTabKind::Terminal,
                            page_id: None,
                            tab_id: ProjectTabId::new(),
                            title: "Shell".to_string(),
                            session_id: Some(referenced_session_id),
                        },
                        ProjectTab {
                            kind: ProjectTabKind::Terminal,
                            page_id: None,
                            tab_id: ProjectTabId::new(),
                            title: "Missing".to_string(),
                            session_id: None,
                        },
                    ],
                }),
            })
            .await
            .expect("update second project");

        assert!(store.has_session_reference(referenced_session_id).await);
        assert!(!store.has_session_reference(html_only_session_id).await);
        assert!(!store.has_session_reference(missing_session_id).await);
        remove_temp_projects(&path);
    }

    fn temp_projects_path(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!("aria-projects-{label}-{unique}.toml"))
    }

    fn remove_temp_projects(path: &PathBuf) {
        if path.exists() {
            fs::remove_file(path).expect("remove temp project file");
        }
    }
}
