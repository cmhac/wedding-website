import { AccessDenied } from "@/components/admin/AccessDenied";
import { AddMenuItemForms } from "@/components/admin/AddMenuItemForms";
import { CategoriesView } from "@/components/admin/CategoriesView";
import { MenuViewBody } from "@/components/admin/MenuViewBody";
import {
  EmptyState,
  PageHeader,
  TabLinks,
} from "@/components/admin/primitives";
import {
  archiveDish,
  restoreDish,
  saveCategory,
  saveCourse,
  saveDish,
  setMenuStatus,
} from "@/lib/admin/actions/menus";
import {
  loadDietaryCategories,
  loadMenu,
  loadMenuEvents,
} from "@/lib/admin/data/menus";
import { messageFor } from "@/lib/admin/messages";
import { isForbidden, requireStaffPage } from "@/lib/admin/session";

type SearchParams = Record<string, string | string[] | undefined>;

const TABS = [
  { value: "menu", label: "Menu" },
  { value: "add", label: "Add course or dish" },
  { value: "categories", label: "Dietary categories" },
];

const REFUSALS = ["unauthenticated", "forbidden", "not_found", "server_error"];

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaffPage();
  if (isForbidden(session)) return <AccessDenied />;
  const { supabase } = session;

  const params = await searchParams;
  const tab = TABS.some((t) => t.value === first(params.tab))
    ? (first(params.tab) as string)
    : "menu";

  const events = await loadMenuEvents(supabase);
  const slug =
    events.find((e) => e.slug === first(params.event))?.slug ?? events[0]?.slug;
  const loaded = slug ? await loadMenu(slug, supabase) : null;

  const header = (
    <PageHeader
      title="Menus"
      description="Courses, dishes and dietary tags for each event."
    />
  );

  if (!loaded) {
    return (
      <div className="stack">
        {header}
        <EmptyState>There are no events yet, so there are no menus.</EmptyState>
      </div>
    );
  }

  const { event, menu } = loaded;
  const errorCode = first(params.error);
  const archived = first(params.archived);
  const households = first(params.households);
  const editingDish = menu?.courses
    .flatMap((course) => course.dishes.map((dish) => ({ course, dish })))
    .find(({ dish }) => dish.id === first(params.dish) && !dish.archivedAt);

  return (
    <div className="stack">
      {header}
      <TabLinks
        label="Menu sections"
        basePath="/admin/menus"
        param="tab"
        tabs={TABS}
        current={tab}
        query={{ event: event.slug }}
      />

      {tab === "menu" ? (
        <MenuViewBody
          events={events}
          event={event}
          menu={menu}
          confirmArchiveDishId={
            first(params.confirm) === "archive" ? first(params.dish) : undefined
          }
          archiveResult={
            archived !== undefined
              ? {
                  guests: Number(archived) || 0,
                  households: Number(households) || 0,
                }
              : undefined
          }
          errorMessage={
            errorCode && REFUSALS.includes(errorCode)
              ? messageFor(errorCode)
              : undefined
          }
          actions={{ setMenuStatus, archiveDish, restoreDish }}
        />
      ) : null}

      {tab === "add" ? (
        menu ? (
          <AddMenuItemForms
            eventId={event.id}
            menuId={menu.id}
            courses={menu.courses.map((c) => ({ id: c.id, name: c.name }))}
            categories={await loadDietaryCategories(supabase)}
            nextCourseOrder={
              menu.courses.reduce(
                (max, c) => Math.max(max, c.displayOrder ?? 0),
                0,
              ) + 1
            }
            editingDish={
              editingDish
                ? {
                    id: editingDish.dish.id,
                    courseId: editingDish.course.id,
                    name: editingDish.dish.name,
                    description: editingDish.dish.description,
                    tagKeys: editingDish.dish.tags.map((t) => t.key),
                  }
                : undefined
            }
            actions={{ saveCourse, saveDish }}
          />
        ) : (
          <EmptyState>
            {event.name} does not have a menu yet. Create it on the Menu tab
            first.
          </EmptyState>
        )
      ) : null}

      {tab === "categories" ? (
        <CategoriesView
          categories={await loadDietaryCategories(supabase)}
          action={saveCategory}
        />
      ) : null}
    </div>
  );
}
