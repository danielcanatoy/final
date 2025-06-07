import { getJournalEntries } from "@/actions/journal";
import { getCollections } from "@/actions/collection";
import { JournalFilters } from "./_components/journal-filters";
import DeleteCollectionDialog from "./_components/delete-collection";

export default async function CollectionPage({ params }) {
  const { collectionId } = params;

  const entriesResult = await getJournalEntries({ collectionId });
  const collections =
    collectionId !== "unorganized" ? await getCollections() : null;
  const collection = collections?.find((c) => c.id === collectionId);

  const journalEntries = entriesResult.success
    ? entriesResult.data.entries
    : [];

  if (!entriesResult.success) {
    console.error("Failed to load entries:", entriesResult.error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between">
        <div className="flex justify-between">
          <h1 className="text-4xl font-bold gradient-title">
            {collectionId === "unorganized"
              ? "Unorganized Entries"
              : collection?.name || "Collection"}
          </h1>
          {collection && (
            <DeleteCollectionDialog
              collection={collection}
              entriesCount={journalEntries.length}
            />
          )}
        </div>
        {collection?.description && (
          <h2 className="font-extralight pl-1">{collection.description}</h2>
        )}
      </div>

      {/* Client-side Filters Component */}
      <JournalFilters entries={journalEntries} />
    </div>
  );
}
